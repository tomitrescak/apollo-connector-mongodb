import * as assert from 'power-assert';
import * as sinon from 'sinon';

import { MongoClient, Db } from 'mongodb';
const host = process.env.MONGODB_HOST || '127.0.0.1';
const port = process.env.MONGODB_PORT || 27017;

import Entity from '../mongo_entity';

const collectionName = 'Collection';

describe('entity', () => {

  let db: Db = null;
  const connector: any = {
    collection(name: string) { return db.collection(name); }
  };

  // connecto to database
  before(async function () {
    const name = "tmp" + Math.floor(Math.random() * 10000);

    db = await MongoClient.connect(`mongodb://${host}:${port}/${name}`);
    db['dispose'] = async function () {
      await db.dropDatabase();
    }; 

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

  it('contains connector and collection name', () => {
    const entity: any = new Entity(connector, collectionName);
    assert.equal(entity._collectionName, collectionName);
    assert.equal(entity.connector, connector);
    assert.notEqual(entity.collection, null);
  });

  it('can find a multiple record', () => {
    const entity = new Entity(connector, collectionName);
    const find = sinon.spy(entity.collection, 'find');

    const selector = {};
    const fields = {};
    const skip = 1;
    const limit = 2;
    const timeout = 1000;

    entity.find(selector, fields, skip, limit, timeout);
    assert(find.calledWithExactly(selector, fields, skip, limit, timeout));
  });

  it('can find a sinlge record', () => {
    const entity = new Entity(connector, collectionName);
    const find = sinon.spy(entity.collection, 'find');

    const selector = {};
    const options = {};

    entity.findOne(selector, options);
    assert(find.calledWithExactly(selector, options));
  });
 
  it('can find and cache results of finding a single item', async () => {
    const entity = new Entity(connector, collectionName);
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

  it('can find and cache results of finding multiple items', async () => {
    const entity = new Entity(connector, collectionName);
    entity.collection.insertOne({ _id: '1' });

    const find = sinon.spy(entity.collection, 'find');

    // first we test if DB is called every time
    let result = await entity.findManyCached();
    result = await entity.findManyCached();
    assert.deepEqual(result, [{ _id: '1' }]);
    assert(find.calledOnce);
  });

  it('clears the cache when a new document is inserted', async function () {
    const entity = new Entity(connector, collectionName);
    const find = sinon.spy(entity.collection, 'find');

    entity.insert({ _id: '2' });
    let result = await entity.findManyCached();
    // insert document
    entity.insert({ _id: '2' });
    result = await entity.findManyCached();

    assert(find.calledTwice);
    assert.deepEqual(result, [{ _id: '1' }, { _id: '2' }]);
  });

  it('clears the related cache when a document is updated', async function () {
    const entity = new Entity(connector, collectionName);
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
    const entity = new Entity(connector, collectionName);
    entity.insert({ _id: '1', file: 'foo' });
    entity.insert({ _id: '2', file: 'bar' });

    let foo = await entity.findOneCachedById('1');
    let bar = await entity.findOneCachedById('2');

    entity.update({ file: 'foo'}, { $set: { file: 'boo' } });

    const findSpy = sinon.spy(entity.collection, 'findOne');
    foo = await entity.findOneCachedById('1');
    bar = await entity.findOneCachedById('2');

    assert(findSpy.calledTwice);
  });
})
