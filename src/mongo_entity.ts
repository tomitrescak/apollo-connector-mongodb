import * as Random from "meteor-random";

import MongoConnector from "./mongo_connector";

import { LRUCache } from "lru-cache";

const DataLoader = require("dataloader");

export interface IDataLoader<S, T> {
  clear(id: string): void;
  clearAll(): void;
  load(key: string);
}

import {
  Collection,
  Filter,
  FindCursor,
  FindOptions,
  OptionalUnlessRequiredId,
  UpdateOptions
} from "mongodb";

export interface Options<K, V> {
  batch?: boolean;
  cache?: boolean;
  cacheKeyFn?: (key: any) => any;
  cacheMap?: CacheWrapper<K, V> | "lru"; // TODO: add TTL
  cacheTTLMs?: number;
  cacheSize?: number;
  clearOnInsert?: boolean;
  clearOnUpdate?: boolean;
  selectorKeyFn?: (key: any) => any;
}

interface CacheWrapper<K, V> {
  clear();
  get(key: K): V;
  set(key: K, value: V);
  delete(key: K);
}

export class LruCacheWrapper<K, V> implements CacheWrapper<K, V> {
  cache: LRUCache<K, V>;

  constructor(cacheSize = 500, ttl = 1000 * 5) {
    this.cache = new LRUCache({ max: cacheSize, ttl: ttl || undefined }); // 5-minutes TTL
  }

  clear() {
    this.cache.clear();
  }
  get(key: K) {
    return this.cache.get(key) || undefined;
  }
  set(key: K, value: V) {
    return this.cache.set(key, value);
  }
  delete(key: K) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      return true;
    }
    return false;
  }
}

interface ILoader<T> {
  selectorKeyFn(key: any): any;
  dataLoader: IDataLoader<any, T[]>;
}

export default class MongoEntity<T> {
  connector: MongoConnector;
  random: typeof Random;

  private _collectionName: string;
  private _collection: Collection<T>;
  private _singleLoader: IDataLoader<any, T>;
  private _multiLoader: IDataLoader<any, T[]>;
  private _insertLoaders: ILoader<T>[];
  private _updateLoaders: ILoader<T>[];
  public static DefaultCache: any;
  private _cache: "lru" | any;

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
    if (this._updateLoaders) {
      this._updateLoaders.forEach((u) => {
        const key = u.selectorKeyFn && u.selectorKeyFn(selector);
        if (key) {
          u.dataLoader.clear(key);
        } else {
          u.dataLoader.clearAll();
        }
      });
    }
  }

  clearInsertCaches(selector: any) {
    if (this._insertLoaders) {
      this._insertLoaders.forEach((u) => {
        const key = u.selectorKeyFn && u.selectorKeyFn(selector);
        if (key) {
          u.dataLoader.clear(key);
        } else {
          u.dataLoader.clearAll();
        }
      });
    }
  }

  assignFilter(
    object: Object,
    selector: Object,
    result: Object,
    include: 0 | 1
  ) {
    return (k: string) => {
      if (selector[k] != include) {
        throw new Error("You cannot combine include and exclude!");
      }
      if (include) {
        if (object[k] !== undefined) {
          result[k] = object[k];
        }
      } else {
        delete result[k];
      }
    };
  }

  filter(object: Object, selector: Object): T {
    let keys = Object.keys(selector);
    if (keys.length == 0) {
      throw new Error("You need to specify the selector!");
    }

    let include = selector[keys[0]];
    let result: any = include ? {} : Object.assign({}, object);
    let selectorFunction = this.assignFilter(object, selector, result, include);
    keys.forEach(selectorFunction);
    return result;
  }

  find(
    selector: Filter<T>,
    projection?: Object,
    skip?: number,
    limit?: number,
    timeout?: number
  ): FindCursor<T> {
    return this.collection.find(selector, {
      projection,
      skip,
      limit
    }) as FindCursor<T>;
  }

  findOne(selector: Object, options?: FindOptions): Promise<T> {
    return this.collection.findOne(selector, options) as Promise<T>;
  }

  async findOneCached(
    loader: IDataLoader<string, T>,
    key: string,
    selector?: Object
  ): Promise<T> {
    const result = await loader.load(key);
    if (result && selector) {
      // do not cache null values, always try to reload
      return this.filter(result, selector);
    } else {
      return result;
    }
  }

  async findOneCachedById(id: string, selector?: Object): Promise<T> {
    if (!this._singleLoader) {
      this._singleLoader = this.createLoader((loadId) => {
        return this.findOne({ _id: loadId });
      }, this.addCacheToOptions({ clearOnUpdate: true, clearOnInsert: true, selectorKeyFn: (a: any) => a._id }));
    }
    return this.findOneCached(this._singleLoader, id, selector);
  }

  async findManyCached(
    loader: IDataLoader<string, T[]>,
    key: string,
    selector?: Object
  ): Promise<T[]> {
    if (selector) {
      const result = await loader.load(key);
      return result.map((r) => this.filter(r, selector));
    } else {
      return loader.load(key);
    }
  }

  async findAllCached(selector?: Object): Promise<T[]> {
    if (!this._multiLoader) {
      this._multiLoader = this.createLoader(
        () => this.collection.find().toArray() as any,
        this.addCacheToOptions({
          clearOnInsert: true,
          clearOnUpdate: true,
          selectorKeyFn: (a: any): any => null
        })
      );
    }
    return this.findManyCached(this._multiLoader, "ALL", selector);
  }

  addCacheToOptions(options: any) {
    if (options.cacheMap) {
      return options;
    } else if (this._cache) {
      options.cacheMap = this._cache;
    } else {
      options.cacheMap = "lru";
    }
    return options;
  }

  insertOne(document: OptionalUnlessRequiredId<T>) {
    this.clearInsertCaches(document);
    return this.collection.insertOne(document);
  }

  insertMany(document: OptionalUnlessRequiredId<T>[]) {
    this.clearInsertCaches(document);
    return this.collection.insertMany(document);
  }

  deleteOne(selector: Object, many = false) {
    this.clearInsertCaches(selector);
    return this.collection.deleteOne(selector);
  }

  deleteMany(selector: Object, many = false) {
    this.clearInsertCaches(selector);
    return this.collection.deleteMany(selector);
  }

  dispose() {
    return this.deleteMany({}, true);
  }

  updateOne(selector: Object, update: Object, options?: UpdateOptions) {
    this.clearUpdateCaches(selector);
    return this.collection.updateOne(selector, update, options);
  }

  updateMany(selector: Object, update: Object, options?: UpdateOptions) {
    this.clearUpdateCaches(selector);
    return this.collection.updateMany(selector, update, options);
  }

  createLoader(
    selectorFunction: (key: any) => Promise<T>,
    options?: Options<any, T | T[]>
  ) {
    const opts = options;

    // replace caches
    if (opts.cacheMap == "lru") {
      opts.cacheMap = new LruCacheWrapper<any, T>(
        opts.cacheSize,
        opts.cacheTTLMs
      );
    }

    const loader = new DataLoader((keys: any[]) => {
      return Promise.all(keys.map(selectorFunction));
    }, opts);

    if (options) {
      if (options.clearOnInsert) {
        if (!this._insertLoaders) {
          this._insertLoaders = [];
        }
        this._insertLoaders.push({
          dataLoader: loader,
          selectorKeyFn: options.selectorKeyFn
        });
      }

      if (options.clearOnUpdate) {
        if (!this._updateLoaders) {
          this._updateLoaders = [];
        }
        if (!options.selectorKeyFn) {
          throw new Error(
            "You need to provide cache key function to determine when cache needs to be updated"
          );
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
