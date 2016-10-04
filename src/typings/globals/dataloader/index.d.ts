/**
 * This is a d.ts file build from https://github.com/facebook/dataloader/blob/master/src/index.js
 * Usage:
 * import DataLoader = require('dataloader');
 *
*/

declare module "dataloader" {
    /**
     *  Copyright (c) 2015, Facebook, Inc.
     *  All rights reserved.
     *
     *  This source code is licensed under the BSD-style license found in the
     *  LICENSE file in the root directory of this source tree. An additional grant
     *  of patent rights can be found in the PATENTS file in the same directory.
     */

    // A Function, which when given an Array of keys, returns a Promise of an Array
    // of values or Errors.
    export type BatchLoadFn<K, V> = (keys: Array<K>) => Promise<Array<V | Error>>;

    // Optionally turn off batching or caching or provide a cache key function or a
    // custom cache instance.
    export interface Options<K, V> {
        batch?: boolean;
        cache?: boolean;
        cacheKeyFn?: (key: any) => any;
        cacheMap?: CacheMap<K, Promise<V>>;
    }

    // If a custom cache is provided, it must be of this type (a subset of ES6 Map).
    export interface CacheMap<K, V> {
        get(key: K): V | void;
        set(key: K, value: V): any;
        delete(key: K): any;
        clear(): any;
    }
    
    /**
     * A `DataLoader` creates a public API for loading data from a particular
     * data back-end with unique keys such as the `id` column of a SQL table or
     * document name in a MongoDB database, given a batch loading function.
     *
     * Each `DataLoader` instance contains a unique memorized cache. Use caution when
     * used in long-lived applications or those which serve many users with
     * different access permissions and consider creating a new instance per
     * web request.
     */
    export interface IDataLoader<K, V> {
        new(
            batchLoadFn: BatchLoadFn<K, V>,
            options?: Options<K, V>
        ): IDataLoader<K,V>;

        /**
         * Loads a key, returning a `Promise` for the value represented by that key.
         */
        load(key: K): Promise<V>;

        /**
         * Loads multiple keys, promising an array of values:
         *
         *     var [ a, b ] = await myLoader.loadMany([ 'a', 'b' ]);
         *
         * This is equivalent to the more verbose:
         *
         *     var [ a, b ] = await Promise.all([
         *       myLoader.load('a'),
         *       myLoader.load('b')
         *     ]);
         *
         */
        loadMany(keys: Array<K>): Promise<Array<V>>;

        /**
         * Clears the value at `key` from the cache, if it exists. Returns itself for
         * method chaining.
         */
        clear(key: K): IDataLoader<K, V>;

        /**
         * Clears the entire cache. To be used when some event results in unknown
         * invalidations across this particular `DataLoader`. Returns itself for
         * method chaining.
         */
        clearAll(): IDataLoader<K, V>;

        /**
         * Adds the provided key and value to the cache. If the key already exists, no
         * change is made. Returns itself for method chaining.
         */
        prime(key: K, value: V): IDataLoader<K, V>;
    }
}