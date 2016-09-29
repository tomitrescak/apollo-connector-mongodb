import * as assert from 'power-assert';
import * as sinon from 'sinon';

import { MongoClient, Db } from 'mongodb';

import { config, getConnector, disposeDb, withEntity } from '../testing';

import Entity from '../mongo_entity';

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

    assert.equal(entity['_dataLoaderOptions'].cacheMap, cache);

    const globalCache = { global: '1' };
    Entity.DataLoaderOptions = { cacheMap: globalCache };

    const otherEntity = new Entity(null, 'name');
    assert.equal(otherEntity['_dataLoaderOptions'].cacheMap, globalCache);

    Entity.DataLoaderOptions = null;
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
    it('can find and cache results of finding a single item', async () => {
      await withEntity(async (entity) => {
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
        }]}) 
    });

    it('clears the related cache when a document is updated', async function () {
      await withEntity(async (entity) => {
        const findSpy = sinon.spy(entity.collection, 'findOne');
        const cacheSpy = sinon.spy(entity, 'clearUpdateCaches');

        await entity.insert({ _id: '1', file: 'foo' });
        await entity.insert({ _id: '2', file: 'bar' });

        let foo = await entity.findOneCachedById('1');
        let bar = await entity.findOneCachedById('2');

        const selector = { _id: '1' };
        entity.update(selector, { $set: { file: 'boo' } });
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
    });

    it('clears all caches when a document is updated and selector is unknown', async function () {
      await withEntity(async (entity) => {
        let foo = await entity.findOneCachedById('1');
        let bar = await entity.findOneCachedById('2');

        entity.update({ file: 'foo' }, { $set: { file: 'boo' } });

        const findSpy = sinon.spy(entity.collection, 'findOne');
        foo = await entity.findOneCachedById('1');
        bar = await entity.findOneCachedById('2');

          assert(findSpy.calledTwice);
        }, 
        // {
        //     data: [
        //       { _id: '1', file: 'foo' },
        //       { _id: '2', file: 'bar' }
        //   ]
      //   }
        );
    });



    it('findOneCached can filter returned results', async () => {
      await withEntity(async (entity) => {
        await entity.insert({ _id: '00', a: '1', b: '2', c: '3' });

        // first we test if DB is called every time
        let result = await entity.findOneCachedById('00', { b: 1 });
        assert.deepEqual(result, { b: '2' });
      });
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

        entity.insert({ _id: '1' });
        let result = await entity.findAllCached();
        // insert document
        entity.insert({ _id: '2' });
        result = await entity.findAllCached();

        assert(find.calledTwice);
        assert.deepEqual(result, [{ _id: '1' }, { _id: '2' }]);
      });
    });
  });

  describe('delete', () => {
    it('can delete a single document', async () => {
      await withEntity(async (entity) => {
        await entity.insert({ _id: '00', a: '1', b: '2', c: '3' });
        await entity.insert({ _id: '01', a: '1', b: '2', c: '3' });

        let result = await entity.findAllCached();
        assert.equal(result.length, 2);

        await entity.delete({ _id: '00' });

        result = await entity.findAllCached();
        assert.equal(result.length, 1);
      });
    });

    it('can delete multiple documents', async function () {
      await withEntity(async (entity) => {
        await entity.insert({ _id: '00', a: '1', b: '2', c: '3' });
        await entity.insert({ _id: '01', a: '1', b: '2', c: '3' });

        await entity.delete({}, true);

        const result = await entity.findAllCached();
        assert.equal(result.length, 0);
      });
    });
  });

  describe('testing', () => {
    it('can execute test with multiple entities', async function() {
      await withEntity((e1, e2, e3) => {
        assert(e1);
        assert.equal(e1.collection.collectionName, 'e1');
        assert(e2);
        assert.equal(e2.collection.collectionName, 'e2');
        assert(e3);
        assert.equal(e3.collection.collectionName, 'e3');
      }, { entities: [{ name: 'e1'}, { name: 'e2'}, { name: 'e3'}] })
    });
  })
});
