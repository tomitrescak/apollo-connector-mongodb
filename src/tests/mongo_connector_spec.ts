import * as proxyquire from 'proxyquire';
import * as assert from 'power-assert';
import * as sinon from 'sinon';

// import proxied connector
const connectStub = sinon.spy();

const MongoStub: any = {
  MongoClient: {
    connect: () => {}
  }
}
const MongoConnector = proxyquire('../mongo_connector', { 'mongodb': MongoStub }).default;

describe('connector', () => {
  it('will initialise url', () => {
    //console.log(connectStub.calledOnce);
    //assert()
    const url = 'mongodb://url';
    const spy = sinon.spy();

    MongoStub.MongoClient.connect = () => spy();

    const connector = new MongoConnector(url, null);
    assert.equal(connector.mongoUrl, url);
    assert(spy.calledOnce);
  });

  it('will not initialise db on error and logs error', () => {

    //assert()
    const url = 'mongodb://url';
    const successSpy = sinon.spy();

    // spy on console.dir
    try { sinon.spy(console, 'dir'); } catch (e) { }
    MongoStub.MongoClient.connect = (url: string, func: Function) => func('error');
    
    console.dir['reset']();
    const connector = new MongoConnector(url, null);
    assert.equal(connector.db, undefined);
    assert(console.dir['calledOnce']);
    assert(console.dir['calledWith']('error'));

    console.dir['restore']();
  });

  it('will initialise and calls back', () => {

    //assert()
    const url = 'mongodb://url';
    const db = {};
    const startedSpy = sinon.spy();

    MongoStub.MongoClient.connect = (url: string, func: Function) => func(null, db);
    
    const connector = new MongoConnector(url, startedSpy);
    assert.equal(connector.db, db);
    assert(startedSpy.calledOnce);
  });

  it('will create a new collection', () => {

    //assert()
    const url = '';
    const db = {
      collection: sinon.spy()
    };

    MongoStub.MongoClient.connect = (url: string, func: Function) => func(null, db);
    
    const connector = new MongoConnector(url);
    assert.equal(connector.db, db);

    // get a new collection
    const collectionName = 'Col';
    const col = connector.collection(collectionName);

    assert(db.collection.calledWith(collectionName));
  });
});