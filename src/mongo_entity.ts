import MongoConnector from './mongo_connector';
import * as Random from 'meteor-random';
import DataLoader = require('dataloader');

import { Collection, FindOneOptions, Cursor, ReplaceOneOptions, 
  InsertOneWriteOpResult, UpdateWriteOpResult, DeleteWriteOpResultObject } from 'mongodb';

export default class MongoEntity<T> {

  connector: MongoConnector;
  random: typeof Random;

  private _collectionName: string;
  private _collection: Collection<T>;
  private _singleLoader: DataLoader<string, T>;
  private _multiLoader: DataLoader<string, T[]>;

  get collection(): Collection<T> {
    if (!this._collection) {
      this._collection = this.connector.collection(this._collectionName);
    }
    return this._collection;
  }

  constructor(connector: MongoConnector, collectionName: string) {
    this.connector = connector;
    this._collectionName = collectionName;
  }

  clearUpdateCaches(selector: any) {
    if (this._singleLoader) {
      if (selector._id) {
        this._singleLoader.clear(selector._id);
      } else {
        this._singleLoader.clearAll();
      }
    }
   }
  clearInsertCaches(selector: Object) {
    if (this._multiLoader) {
      this._multiLoader.clearAll();
    }
  }

  assignFilter(object: Object, selector: Object, result: Object, include: 0 | 1) {
    return (k: string) => {
      if (selector[k] != include) {
        throw new Error('You cannot combine include and exclude!');
      }
      if (include) {
        result[k] = object[k];
      } else {
        delete(result[k]);
      }
    }
  }

  filter(object: Object, selector: Object) {
    let keys = Object.keys(selector);
    if (keys.length == 0) {
      throw new Error('You need to specify the selector!');
    }

    let include = selector[keys[0]];
    let result = include ? {} : Object.assign({}, object);
    let selectorFunction = this.assignFilter(object, selector, result, include);
    keys.forEach(selectorFunction);
    return result;
  }

  find(selector: Object, fields?: Object, skip?: number, limit?: number, timeout?: number): Cursor<T> {
    return this.collection.find(selector, fields, skip, limit, timeout);
  }

  findOne(selector: Object, options?: FindOneOptions): Promise<T> {
    return this.collection.findOne(selector, options);
  } 

  async findOneCachedById(id: string, selector?: Object) {
    if (!this._singleLoader) {
      this._singleLoader = new DataLoader((keys: string[]) => {
        return Promise.all(keys.map(async (loadId) => {
          return await this.collection.findOne({_id: loadId });
        }));
      });
    }
    if (selector) {
      const result = await this._singleLoader.load(id);
      return this.filter(result, selector);
    } else {
      return this._singleLoader.load(id);
    }
  }

  async findManyCached(selector?: Object) {

    if (!this._multiLoader) {
      this._multiLoader = new DataLoader((param: any) => {
        return Promise.all([this.collection.find().toArray()]);
      });
    }

    if (selector) {
      const result = await this._multiLoader.load('ALL');
      return result.map(r => this.filter(r, selector));
    } else {
      return this._multiLoader.load('ALL');
    }
    
  }

  insert(document: T): Promise<InsertOneWriteOpResult> {
    this.clearInsertCaches(document);

    return this.collection.insertOne(document);
  }

  delete(document: T, many = false): Promise<DeleteWriteOpResultObject> {
    this.clearInsertCaches(document);
    if (many) {
      return this.collection.deleteMany(document);
    }
    return this.collection.deleteOne(document);
  }

  update(selector: Object, update: Object, options?: ReplaceOneOptions): Promise<UpdateWriteOpResult> {
    this.clearUpdateCaches(selector);

    return this.collection.updateOne(selector, update, options);
  }
}
