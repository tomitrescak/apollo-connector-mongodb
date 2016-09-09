import MongoConnector from './mongo_connector';
import Random from 'meteor-random';
const DataLoader = require('dataloader');

import { Collection, FindOneOptions, Cursor, ReplaceOneOptions } from 'mongodb';

export default class MongoEntity<T> {

  connector: MongoConnector;
  random: typeof Random;

  private _collectionName: string;
  private _collection: Collection<T>;
  private _singleLoader: IDataLoader<string, T>;
  private _multiLoader: IDataLoader<string, T[]>;

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

  find(selector: Object, fields?: Object, skip?: number, limit?: number, timeout?: number): Cursor<T> {
    return this.collection.find(selector, fields, skip, limit, timeout);
  }

  findOne(selector: Object, options?: FindOneOptions): Promise<T> {
    return this.collection.findOne(selector, options);
  } 

  async findOneCachedById(id: string) {
    if (!this._singleLoader) {
      this._singleLoader = new DataLoader((keys: string[]) => {
        return Promise.all(keys.map(async (loadId) => {
          return await this.collection.findOne({_id: loadId });
        }));
      });
    }
    return this._singleLoader.load(id);
  }

  async findManyCached() {

    if (!this._multiLoader) {
      this._multiLoader = new DataLoader((param: any) => {
        return Promise.all([this.collection.find().toArray()]);
      });
    }
    return  this._multiLoader.load('ALL');
  }

  insert(document: T) {
    this.clearInsertCaches(document);

    return this.collection.insertOne(document);
  }

  update(selector: Object, update: Object, options?: ReplaceOneOptions) {
    this.clearUpdateCaches(selector);

    return this.collection.updateOne(selector, update, options);
  }
}
