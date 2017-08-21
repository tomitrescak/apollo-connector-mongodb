import * as assert from 'power-assert';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';

import { MongoClient, Db } from 'mongodb';
import { config, getConnector, withEntity, itWithEntity as ite } from '../testing';

import Entity, { LruCacheWrapper } from '../mongo_entity';
import * as lru from 'lru-cache';

const host = process.env.MONGODB_HOST || '127.0.0.1';
const port = process.env.MONGODB_PORT || 27017;

describe('entity', () => {

  it('contains connector and collection name', async () => {
    var connector: any = await getConnector();
    var collectionName = 'name';
    var entity = new Entity(connector, collectionName)
    assert.equal(entity.collection.collectionName, collectionName);
    assert.equal(entity.connector, connector);
    assert.notEqual(entity.collection, null);
  });

  it('is possible to initialise entity with custom cache', function () {
    const cache = { local: '' };
    const entity = new Entity(null, 'name', cache);

    assert.equal(entity['_cache'], cache);

    const globalCache: any = { global: '1' };
    Entity.DefaultCache = globalCache;

    const otherEntity = new Entity(null, 'name');
    assert.equal(otherEntity['_cache'], globalCache);

    Entity.DefaultCache = null;
  });

  describe('find', () => {
    it('can find a multiple record', async () => {
      await withEntity((entity) => {
        const find = sinon.spy(entity.collection, 'find');
        const selector = {};
        const fields = {};
        const skip = 1;
        const limit = 2;
        const timeout = 1000;

        entity.find(selector, fields, skip, limit, timeout);
        assert(find.calledWithExactly(selector, fields, skip, limit, timeout));
      });
    });
  });

  describe('findOne', () => {
    it('can find a single record', async () => {
      await withEntity((entity) => {
        const find = sinon.spy(entity.collection, 'find');
        const selector = {};
        const options = {};

        entity.findOne(selector, options);
        assert(find.calledWithExactly(selector, options));
      });
    });
  });

  describe('findOneCachedById', () => {
    ite('returns an item even when it was not previously found, but it wont search twice', async (entity) => {
      const findSpy = sinon.spy(entity.collection, 'findOne');
      let result = await entity.findOneCachedById('1');
      assert.equal(result, null);
      sinon.assert.calledOnce(findSpy);
      result = await entity.findOneCachedById('1');
      assert.equal(result, null);
      sinon.assert.calledOnce(findSpy);

      // insrt given element
      const element = {_id: '1' };
      await entity.insertOne(element);
      result = await entity.findOneCachedById('1');
      assert.deepEqual(result, element);
      sinon.assert.calledTwice(findSpy);

    });

    ite('can find and cache results of finding a single item', async (entity) => {
      const find = sinon.spy(entity.collection, 'findOne');

      // first we test if DB is called every time
      let result = await entity.findOne({ _id: '1' });
      result = await entity.findOne({ _id: '1' });
      assert.deepEqual(result, { _id: '1' });

      assert(find.calledTwice);

      // now test caching
      find.reset();
      result = await entity.findOneCachedById('1');
      result = await entity.findOneCachedById('1');

      assert(find.calledOnce);
    }, {
        entities: [{
          data: [{ _id: '1' }]
        }]
      });

    ite('clears the related cache when a document is updated', async function (entity) {
      const findSpy = sinon.spy(entity.collection, 'findOne');
      const cacheSpy = sinon.spy(entity, 'clearUpdateCaches');

      await entity.insertOne({ _id: '1', file: 'foo' });
      await entity.insertOne({ _id: '2', file: 'bar' });

      let foo = await entity.findOneCachedById('1');
      let bar = await entity.findOneCachedById('2');

      const selector = { _id: '1' };
      await entity.updateOne(selector, { $set: { file: 'boo' } });
      assert(cacheSpy.calledWith(selector))

      // check update 
      findSpy.reset();

      foo = await entity.findOneCachedById('1');
      assert.deepEqual(foo, { _id: '1', file: 'boo' });
      assert(findSpy.calledOnce);

      // check if the other has been called coorectly
      findSpy.reset();
      bar = await entity.findOneCachedById('2');
      assert(findSpy.notCalled);
    });

    ite('clears all caches when a document is updated and selector is unknown', async function (entity) {
      let foo = await entity.findOneCachedById('1');
      let bar = await entity.findOneCachedById('2');

      entity.updateOne({ file: 'foo' }, { $set: { file: 'boo' } });

      const findSpy = sinon.spy(entity.collection, 'findOne');
      foo = await entity.findOneCachedById('1');
      bar = await entity.findOneCachedById('2');

      assert(findSpy.calledTwice);
    });


    ite('findOneCached can filter returned results', async (entity) => {
        await entity.insertOne({ _id: '00', a: '1', b: '2', c: '3' });

        // first we test if DB is called every time
        let result = await entity.findOneCachedById('00', { b: 1 });
        assert.deepEqual(result, { b: '2' });
    });

    ite('findOneCached returns null if entity does not exists', async (entity) => {
        // first we test if DB is called every time
        let result = await entity.findOneCachedById('0');
        assert.deepEqual(result, null);

        result = await entity.findOneCachedById('0', { field: 1 });
        assert.deepEqual(result, null);
    });
  });

  describe('updates', () => {
    ite('one', async function(entity: Entity<any>) {
      const stub = sinon.stub(entity.collection, 'updateOne');
      const selector = {};
      const modifier = {};
      const properties = {};
      entity.updateOne(selector, modifier, properties);
      sinon.assert.calledWith(stub, selector, modifier, properties)
    });

    ite('many', async function(entity) {
      const stub = sinon.stub(entity.collection, 'updateMany');
      const selector = {};
      const modifier = {};
      const properties = {};
      entity.updateMany(selector, modifier, properties);
      sinon.assert.calledWith(stub, selector, modifier, properties)
    })
  })

  describe('addCacheToOptions', () => {
    it('adds entitys cache to options', function () {
      const cache = { g: 1 };
      const entity = new Entity(null, null, cache);
      const options = {};

      const res1 = entity.addCacheToOptions(options);
      assert.deepEqual(res1, { cacheMap: cache });

      const optionsWithCache = { cacheMap: {} };
      const res2 = entity.addCacheToOptions(optionsWithCache);
      assert.deepEqual(res2, optionsWithCache);
    });
  });

  describe('filter', () => {
    it('can filter objects properties', function () {
      const entity = new Entity(null, null);
      const obj = { a: 1, b: 2, c: 3 };

      const resultWith = entity.filter(obj, { a: 1, c: 1 });
      assert.deepEqual(resultWith, { a: 1, c: 3 });

      const resultWithout = entity.filter(obj, { a: 0, c: 0 });
      assert.deepEqual(resultWithout, { b: 2 });
    });

    it('does not include undefined elements', function () {
      const entity = new Entity(null, null);
      const obj = { a: 1, b: 2, c: 3 };

      const resultWith = entity.filter(obj, { a: 1, c: 1, d: 1 });
      assert.deepEqual(resultWith, { a: 1, c: 3 });
    });

    it('throws error when no filter is specified', function () {
      const entity = new Entity(null, null);
      const obj = {};

      assert.throws(() => entity.filter(obj, {}), /You need to specify the selector!/);
    });

    it('throws error when you mix include exclude', function () {
      const entity = new Entity(null, null);
      const obj = {};

      assert.throws(() => entity.filter(obj, { a: 1, b: 0 }), /You cannot combine include and exclude!/);
    });
  });

  describe('findManyCached', () => {
    it('can find and cache results of finding multiple items', async () => {
      await withEntity(async (entity) => {
        entity.collection.insertOne({ _id: '1' });

        const find = sinon.spy(entity.collection, 'find');

        // first we test if DB is called every time
        let result = await entity.findAllCached();
        result = await entity.findAllCached();
        assert.deepEqual(result, [{ _id: '1' }]);
        assert(find.calledOnce);
      });
    });

    it('findManyCached can filter returned results', async () => {
      await withEntity(async (entity) => {
        await entity.insertMany([
          { _id: '00', a: '1', b: '2', c: '3' },
          { _id: '01', a: '1', b: '2', c: '3' }
        ]);

        // first we test if DB is called every time
        let result = await entity.findAllCached({ a: 1, c: 1 });
        assert.deepEqual(result, [{ a: '1', c: '3' }, { a: '1', c: '3' }]);
      });
    });

    it('clears the cache when a new document is inserted', async function () {
      await withEntity(async (entity) => {
        const find = sinon.spy(entity.collection, 'find');

        entity.insertOne({ _id: '1' });
        let result = await entity.findAllCached();
        // insert document
        entity.insertOne({ _id: '2' });
        result = await entity.findAllCached();

        assert(find.calledTwice);
        assert.deepEqual(result, [{ _id: '1' }, { _id: '2' }]);
      });
    });
  });

  describe('delete', () => {
    it('can delete a single document', async () => {
      await withEntity(async (entity) => {
        await entity.insertOne({ _id: '00', a: '1', b: '2', c: '3' });
        await entity.insertOne({ _id: '01', a: '1', b: '2', c: '3' });

        let result = await entity.findAllCached();
        assert.equal(result.length, 2);

        await entity.deleteOne({ _id: '00' });

        result = await entity.findAllCached();
        assert.equal(result.length, 1);
      });
    });

    it('can delete multiple documents', async function () {
      await withEntity(async (entity) => {
        await entity.insertOne({ _id: '00', a: '1', b: '2', c: '3' });
        await entity.insertOne({ _id: '01', a: '1', b: '2', c: '3' });

        await entity.deleteMany();

        const result = await entity.findAllCached();
        assert.equal(result.length, 0);
      });
    });
  });

  describe('dispose', () => {
    it('deletes all records', function () {
      const entity = new Entity(null, 'name');
      const stub = sinon.stub(entity, 'deleteMany');
      entity.dispose();
      sinon.assert.calledWith(stub, {}, true);
    });
  });

  describe('testing', () => {
    it('can execute test with multiple entities', async function () {
      await withEntity((e1, e2, e3) => {
        assert(e1);
        assert.equal(e1.collection.collectionName, 'e1');
        assert(e2);
        assert.equal(e2.collection.collectionName, 'e2');
        assert(e3);
        assert.equal(e3.collection.collectionName, 'e3');
      }, { entities: [{ name: 'e1' }, { name: 'e2' }, { name: 'e3' }] })
    });
  });

  describe('custom loaders', () => {
    it('throws error when selectorKeyFunction is not specified with updates', async () => {
      await withEntity((entity) => {
        assert.throws(() => entity.createLoader(() => { }, { clearOnUpdate: true }), /You need to provide cache key function to determine when cache needs to be updated/);
      })
    });

    it('can create a new data-loader with a custom cache', async function () {
      await withEntity(async (entity) => {
        const records = [{ _id: 1, name: 'A' }, { _id: 2, name: 'B' }, { _id: 3, name: 'C' }]
        entity.insertMany(records);

        const loader = entity.createLoader(
          (name: string) => {
            return entity.collection.findOne({ name });
          }, {
            cacheMap: new LruCacheWrapper(2),
            clearOnInsert: true,
            clearOnUpdate: true,
            selectorKeyFn: (a: any) => a.name
          }
        );

        // get doc and use cache
        const spy = sinon.spy(entity.collection, 'findOne');
        await entity.findOneCached(loader, 'A');
        await entity.findOneCached(loader, 'A');
        await entity.findOneCached(loader, 'B');
        await entity.findOneCached(loader, 'B');
        await entity.findOneCached(loader, 'A');

        sinon.assert.calledTwice(spy);
        spy.reset();

        await entity.updateOne({ _id: 1 }, { $set: { name: 'D' } });
        const a = await entity.findOneCached(loader, 'A');

        assert.equal(a, null);
        sinon.assert.calledOnce(spy);
        spy.reset();

        // finding new element will need to query for it in DB
        await entity.findOneCached(loader, 'C');
        await entity.findOneCached(loader, 'A');

        sinon.assert.calledOnce(spy);
        spy.reset();

        // finding new element pushed out oldest one form cache
        await entity.findOneCached(loader, 'B');
        sinon.assert.calledOnce(spy);

        // test updates
        spy.reset();

        // B should be out of the cache after update so it will need to be re-requested
        await entity.findOneCached(loader, 'C');
        sinon.assert.calledOnce(spy);
      });
    })
  });

  describe('LruCacheWrapper', () => {
    it('maps lru-cache functions', function () {
      function cacheStub() {
        return {
          get: sinon.stub(),
          set: sinon.stub(),
          reset: sinon.stub(),
          has: sinon.stub(),
          del: sinon.stub()
        }
      }
      const { LruCacheWrapper } = proxyquire('../mongo_entity', { 'lru-cache': cacheStub });
      const cacheWrapper = new LruCacheWrapper();

      cacheWrapper.clear();
      sinon.assert.calledOnce(cacheWrapper.cache.reset);
      cacheWrapper.get();
      sinon.assert.calledOnce(cacheWrapper.cache.get);
      cacheWrapper.set();
      sinon.assert.calledOnce(cacheWrapper.cache.set);
      cacheWrapper.cache.has.returns(true);
      const positiveResult = cacheWrapper.delete('1');
      assert(positiveResult);
      sinon.assert.calledWith(cacheWrapper.cache.del, '1');

      cacheWrapper.cache.has.returns(false);
      const negativeResult = cacheWrapper.delete('1');
      assert.equal(negativeResult, false);
    });



  });
});
