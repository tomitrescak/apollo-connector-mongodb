import MongoConnector from './mongo_connector';
import * as Random from 'meteor-random';
import DataLoader = require('dataloader');

import { Collection, FindOneOptions, Cursor, ReplaceOneOptions, 
  InsertOneWriteOpResult, UpdateWriteOpResult, DeleteWriteOpResultObject } from 'mongodb';

interface Options<K, V> {
    batch?: boolean;
    cache?: boolean;
    cacheKeyFn?: (key: any) => any;
    cacheMap?: Map<K, Promise<V>>;
}

export default class MongoEntity<T> {

  connector: MongoConnector;
  random: typeof Random;

  private _collectionName: string;
  private _collection: Collection<T>;
  private _singleLoader: DataLoader<any, T>;
  private _multiLoader: DataLoader<any, T[]>;
  private _dataLoaderOptions: Options<any, T | T[]>;

  public static DataLoaderOptions: Object;

  get collection(): Collection<T> {
    if (!this._collection) {
      this._collection = this.connector.collection(this._collectionName);
    }
    return this._collection;
  }

  constructor(connector: MongoConnector, collectionName: string, cache?: any) {
    this.connector = connector;
    this._collectionName = collectionName;

    // figure out caching options
    if (cache) {
      this._dataLoaderOptions = {
        cacheMap: cache
      }
    } else if (MongoEntity.DataLoaderOptions) {
      this._dataLoaderOptions = MongoEntity.DataLoaderOptions;
    }
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
        if (object[k] !== undefined) {
          result[k] = object[k];
        }
      } else {
        delete(result[k]);
      }
    }
  }

  filter(object: Object, selector: Object): T {
    let keys = Object.keys(selector);
    if (keys.length == 0) {
      throw new Error('You need to specify the selector!');
    }

    let include = selector[keys[0]];
    let result: any = include ? {} : Object.assign({}, object);
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

  async findOneCached(loader: DataLoader<string, T>, key: string, selector?: Object): Promise<T> {
    if (selector) {
      const result = await loader.load(key);
      return this.filter(result, selector);
    } else {
      return loader.load(key);
    }
  }

  async findOneCachedById(id: string, selector?: Object): Promise<T> {
    if (!this._singleLoader) {
      this._singleLoader = new DataLoader((keys: string[]) => {
        return Promise.all(keys.map((loadId) => {
          return this.collection.findOne({_id: loadId });
        }));
      }, this._dataLoaderOptions);
    }
    return this.findOneCached(this._singleLoader, id, selector);
  }

  async findManyCached(loader: DataLoader<string, T[]>, key: string, selector?: Object): Promise<T[]> {
    if (selector) {
      const result = await loader.load(key);
      return result.map(r => this.filter(r, selector));
    } else {
      return loader.load(key);
    }
  }

  async findAllCached(selector?: Object): Promise<T[]> {
    if (!this._multiLoader) {
      this._multiLoader = new DataLoader((param: any) => {
        return Promise.all([this.collection.find().toArray()]);
      }, this._dataLoaderOptions);
    }
    return this.findManyCached(this._multiLoader, 'ALL', selector);
  }

  insert(document: T): Promise<InsertOneWriteOpResult> {
    this.clearInsertCaches(document);

    return this.collection.insertOne(document);
  }

  insertMany(document: T[]): Promise<InsertOneWriteOpResult> {
    this.clearInsertCaches(document);

    return this.collection.insertMany(document);
  }

  delete(selector: Object, many = false): Promise<DeleteWriteOpResultObject> {
    this.clearInsertCaches(selector);
    if (many) {
      return this.collection.deleteMany(selector);
    }
    return this.collection.deleteOne(selector);
  }

  update(selector: Object, update: Object, options?: ReplaceOneOptions): Promise<UpdateWriteOpResult> {
    this.clearUpdateCaches(selector);

    return this.collection.updateOne(selector, update, options);
  }
}
