import * as assert from 'power-assert';
import * as sinon from 'sinon';

import { MongoClient, Db } from 'mongodb';
const host = process.env.MONGODB_HOST || '127.0.0.1';
const port = process.env.MONGODB_PORT || 27017;

import Entity from '../mongo_entity';

const collectionName = 'Collection';

describe('entity', () => {

  let db: Db = null;
  let name = '';
  const connector: any = {
    collection(name: string) { return db.collection(name); }
  };

  // connecto to database
  before(async function () {
    name = "tmp" + Math.floor(Math.random() * 10000);

    db = await MongoClient.connect(`mongodb://${host}:${port}/${name}`);
    db['dispose'] = async function () {
      await db.dropDatabase();
    };
    global.db = db;

    // delete other
    // const dbs = await db.admin().listDatabases();
    // dbs.databases.forEach((tdb: any) => {
    //   if (tdb.name.substring(0, 3) === 'tmp') {
    //     MongoClient.connect(`mongodb://${host}:${port}/${tdb.name}`, function (err, cdb) {
    //       cdb.dropDatabase();
    //       cdb.close();
    //     });
    //   }
    // })
  });

  // close the connection
  after(function () {
    db['dispose']();
    db.close();
  });


  let entity: Entity<any>;
  beforeEach(async () => {
    entity = new Entity(connector, collectionName);
    await entity.delete({}, true);
  })

  it('contains connector and collection name', () => {
    assert.equal(entity.collection.collectionName, collectionName);
    assert.equal(entity.connector, connector);
    assert.notEqual(entity.collection, null);
  });

  describe('find', () => {
    it('can find a multiple record', () => {
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

  describe('findOne', () => {
    it('can find a single record', () => {
      const find = sinon.spy(entity.collection, 'find');

      const selector = {};
      const options = {};

      entity.findOne(selector, options);
      assert(find.calledWithExactly(selector, options));
    });
  });

  describe('findOneCachedById', () => {
    it('can find and cache results of finding a single item', async () => {
      entity.collection.insertOne({ _id: '1' });

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
    });

    it('clears the related cache when a document is updated', async function () {
      const findSpy = sinon.spy(entity.collection, 'findOne');
      const cacheSpy = sinon.spy(entity, 'clearUpdateCaches');

      entity.insert({ _id: '1', file: 'foo' });
      entity.insert({ _id: '2', file: 'bar' });

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

    it('clears all caches when a document is updated and selector is unknown', async function () {
      entity.insert({ _id: '1', file: 'foo' });
      entity.insert({ _id: '2', file: 'bar' });

      let foo = await entity.findOneCachedById('1');
      let bar = await entity.findOneCachedById('2');

      entity.update({ file: 'foo' }, { $set: { file: 'boo' } });

      const findSpy = sinon.spy(entity.collection, 'findOne');
      foo = await entity.findOneCachedById('1');
      bar = await entity.findOneCachedById('2');

      assert(findSpy.calledTwice);
    });

    it('findOneCached can filter returned results', async () => {
      await entity.insert({ _id: '00', a: '1', b: '2', c: '3' });

      // first we test if DB is called every time
      let result = await entity.findOneCachedById('00', { b: 1 });
      assert.deepEqual(result, { b: '2' });
    });
  });

  describe('filter', () => {
    it('can filter objects properties', function () {
      const obj = { a: 1, b: 2, c: 3 };

      const resultWith = entity.filter(obj, { a: 1, c: 1 });
      assert.deepEqual(resultWith, { a: 1, c: 3 });

      const resultWithout = entity.filter(obj, { a: 0, c: 0 });
      assert.deepEqual(resultWithout, { b: 2 });
    });

    it('does not include undefined elements', function () {
      const obj = { a: 1, b: 2, c: 3 };

      const resultWith = entity.filter(obj, { a: 1, c: 1, d: 1 });
      assert.deepEqual(resultWith, { a: 1, c: 3 });
    });

    it('throws error when no filter is specified', function () {
      const obj = {};

      assert.throws(() => entity.filter(obj, {}), /You need to specify the selector!/);
    });

    it('throws error when you mix include exclude', function () {
      const obj = {};

      assert.throws(() => entity.filter(obj, { a: 1, b: 0 }), /You cannot combine include and exclude!/);
    });
  });

  describe('findManyCached', () => {
    it('can find and cache results of finding multiple items', async () => {
      entity.collection.insertOne({ _id: '1' });

      const find = sinon.spy(entity.collection, 'find');

      // first we test if DB is called every time
      let result = await entity.findManyCached();
      result = await entity.findManyCached();
      assert.deepEqual(result, [{ _id: '1' }]);
      assert(find.calledOnce);
    });

    it('findManyCached can filter returned results', async () => {
      await entity.insert({ _id: '00', a: '1', b: '2', c: '3' });
      await entity.insert({ _id: '01', a: '1', b: '2', c: '3' });

      // first we test if DB is called every time
      let result = await entity.findManyCached({ a: 1, c: 1 });
      assert.deepEqual(result, [{ a: '1', c: '3' }, { a: '1', c: '3' }]);
    });

    it('clears the cache when a new document is inserted', async function () {
      const find = sinon.spy(entity.collection, 'find');

      entity.insert({ _id: '1' });
      let result = await entity.findManyCached();
      // insert document
      entity.insert({ _id: '2' });
      result = await entity.findManyCached();

      assert(find.calledTwice);
      assert.deepEqual(result, [{ _id: '1' }, { _id: '2' }]);
    });
  });

  describe ('delete', () => {
    it('can delete a single document', async () => {
      await entity.insert({ _id: '00', a: '1', b: '2', c: '3' });
      await entity.insert({ _id: '01', a: '1', b: '2', c: '3' });

      let result = await entity.findManyCached();
      assert.equal(result.length, 2);

      await entity.delete({_id: '00'});

      result = await entity.findManyCached();
      assert.equal(result.length, 1);
    });

    it('can delete multiple documents', async function() {
      await entity.insert({ _id: '00', a: '1', b: '2', c: '3' });
      await entity.insert({ _id: '01', a: '1', b: '2', c: '3' });

      await entity.delete({}, true);

      const result = await entity.findManyCached();
      assert.equal(result.length, 0);
    });
  });
})
