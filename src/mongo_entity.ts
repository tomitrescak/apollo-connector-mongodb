import * as Lru from "lru-cache";

import MongoConnector from "./mongo_connector";

const DataLoader = require("dataloader");

export interface IDataLoader<S, T> {
  clear(id: string): void;
  clearAll(): void;
  load(key: string);
}

import {
  Collection,
  DeleteResult,
  Document,
  Filter,
  FindCursor,
  FindOptions,
  InsertManyResult,
  InsertOneResult,
  OptionalId,
  UpdateFilter,
  UpdateOptions,
  UpdateResult,
  WithId,
} from "mongodb";

export interface Options<K, V> {
  batch?: boolean;
  cache?: boolean;
  cacheKeyFn?: (key: any) => any;
  cacheMap?: Map<K, Promise<V>> | "lru"; // TODO: add TTL
  clearOnInsert?: boolean;
  clearOnUpdate?: boolean;
  selectorKeyFn?: (key: any) => any;
}

export class LruCacheWrapper<K, V> {
  cache: any;

  constructor(cacheSize = 500) {
    // const lru = require("lru-cache");
    this.cache = new Lru({ max: cacheSize });
  }

  clear() {
    this.cache.reset();
  }
  get(key: K) {
    return this.cache.get(key) || undefined;
  }
  set(key: K, value: V) {
    return this.cache.set(key, value);
  }
  delete(key: K) {
    if (this.cache.has(key)) {
      this.cache.del(key);
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

  filter(object: Object, selector: Object): WithId<T> {
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

  find(selector: Filter<T>, options?: FindOptions): FindCursor<WithId<T>> {
    return this.collection.find(selector, options);
  }

  findOne(selector: Filter<T>, options?: FindOptions): Promise<WithId<T>> {
    return this.collection.findOne(selector, options);
  }

  async findOneCached(
    loader: IDataLoader<string, T>,
    key: string,
    selector?: Object
  ): Promise<WithId<T>> {
    const result = await loader.load(key);
    if (result && selector) {
      // do not cache null values, always try to reload
      return this.filter(result, selector);
    } else {
      return result;
    }
  }

  async findOneCachedById(id: string, selector?: Object): Promise<WithId<T>> {
    if (!this._singleLoader) {
      this._singleLoader = this.createLoader((loadId) => {
        return this.collection.findOne({ _id: loadId });
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
          selectorKeyFn: (a: any): any => null,
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

  insertOne(document: OptionalId<T>): Promise<InsertOneResult> {
    this.clearInsertCaches(document);
    return this.collection.insertOne(document);
  }

  insertMany(document: OptionalId<T>[]): Promise<InsertManyResult> {
    this.clearInsertCaches(document);
    return this.collection.insertMany(document);
  }

  deleteOne(selector: Object, many = false): Promise<DeleteResult> {
    this.clearInsertCaches(selector);
    return this.collection.deleteOne(selector);
  }

  deleteMany(selector: Object, many = false): Promise<DeleteResult> {
    this.clearInsertCaches(selector);
    return this.collection.deleteMany(selector);
  }

  dispose() {
    return this.deleteMany({}, true);
  }

  updateOne(
    selector: Filter<T>,
    update: UpdateFilter<T>,
    options?: UpdateOptions
  ): Promise<UpdateResult> {
    this.clearUpdateCaches(selector);
    return this.collection.updateOne(selector, update, options);
  }

  updateMany(
    selector: Filter<T>,
    update: UpdateFilter<T>,
    options?: UpdateOptions
  ): Promise<Document | UpdateResult> {
    this.clearUpdateCaches(selector);
    return this.collection.updateMany(selector, update, options);
  }

  createLoader(
    selectorFunction: (key: any) => Promise<WithId<T>>,
    options?: Options<any, T | T[]>
  ) {
    const opts: any = options;

    // replace caches
    if (opts.cacheMap == "lru") {
      opts.cacheMap = new LruCacheWrapper<any, T>();
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
          selectorKeyFn: options.selectorKeyFn,
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
          selectorKeyFn: options.selectorKeyFn,
        });
      }
    }
    return loader;
  }
}
