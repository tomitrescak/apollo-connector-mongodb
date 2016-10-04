import MongoConnector from './mongo_connector';
import * as Random from 'meteor-random';
import DataLoader = require('dataloader');

import {
  Collection, FindOneOptions, Cursor, ReplaceOneOptions,
  InsertOneWriteOpResult, UpdateWriteOpResult, DeleteWriteOpResultObject
} from 'mongodb';

export interface Options<K, V> {
  batch?: boolean;
  cache?: boolean;
  cacheKeyFn?: (key: any) => any;
  cacheMap?: Map<K, Promise<V>> | 'lru'; // TODO: add TTL
  clearOnInsert?: boolean;
  clearOnUpdate?: boolean;
  selectorKeyFn?: (key: any) => any;
}

class LruCacheWrapper<K, V> {
  cache: any;

  constructor() {
    const lru = require('lru-cache');
    this.cache = lru({max: 2});
  }

  clear() { this.cache.reset() }
  get(key: K) { return this.cache.get(key); }
  set(key: K, value: V) { return this.cache.set(key, value); }
  delete(key: K) { 
    if (this.cache.has(key)) {
      this.cache.del(key); 
      return true;
    }
    return false;
  }
}

interface ILoader<T> {
  selectorKeyFn (key: any): any;
  dataLoader: DataLoader<any, T[]>
}

export default class MongoEntity<T> {

  connector: MongoConnector;
  random: typeof Random;

  private _collectionName: string;
  private _collection: Collection<T>;
  private _singleLoader: DataLoader<any, T>;
  private _multiLoader: DataLoader<any, T[]>;

  private _insertLoaders: DataLoader<any, T>[];
  private _updateLoaders: ILoader<T>[];

  public static DefaultCache: any;
  private _cache: 'lru' | any;

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
    this._cache = cache ? cache : MongoEntity.DefaultCache;
  }

  clearUpdateCaches(selector: any) {
    console.log(this._updateLoaders);
    if (this._updateLoaders) {
      this._updateLoaders.forEach(u => {
        const key = u.selectorKeyFn(selector);
        if (key) {
          u.dataLoader.clear(selector._id);
        } else {
          u.dataLoader.clearAll();
        }
      });
      
    }
  }

  clearInsertCaches(selector: Object) {
    if (this._insertLoaders) {
      this._insertLoaders.forEach(i => i.clearAll());
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
        delete (result[k]);
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
      this._singleLoader = this.createLoader((loadId) => {
        return this.collection.findOne({ _id: loadId });
      }, this.createOptions({ clearOnUpdate: true, selectorKeyFn: (a: any) => a._id }));
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
      this._multiLoader = this.createLoader(
        () => this.collection.find().toArray(),
        this.createOptions({ clearOnInsert: true }));
    }
    return this.findManyCached(this._multiLoader, 'ALL', selector);
  }

  createOptions(options: any) {
    if (options.cacheMap) {
      return options;
    }
    if (this._cache) {
      options.cacheMap = this._cache;
    }
    return options;
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

  createLoader(selectorFunction: (key: any) => Promise<any>, options?: Options<any, T | T[]>) {
    const opts: any = options;

    // replace caches
    if (opts.cacheMap == 'lru') {
      opts.cacheMap = new LruCacheWrapper<any, T>();
    }

    const loader = new DataLoader<any, T | T[]>((keys: any[]) => {
      return Promise.all(keys.map(selectorFunction));
    }, opts);

    if (options) {
      if (options.clearOnInsert) {
        if (!this._insertLoaders) {
          this._insertLoaders = [];
        }
        this._insertLoaders.push(loader);
      }

      if (options.clearOnUpdate) {
        if (!this._updateLoaders) {
          this._updateLoaders = [];
        }
        if (!options.selectorKeyFn) {
          throw new Error('You need to provide cache key function to determine when cache needs to be updated')
        }
        this._updateLoaders.push({
          dataLoader: loader,
          selectorKeyFn: options.selectorKeyFn
        });
      }
    }
    return loader;
  }
}
