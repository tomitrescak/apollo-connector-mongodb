import * as proxyquire from 'proxyquire';
import * as assert from 'power-assert';
import * as sinon from 'sinon';

import { MongoClient } from 'mongodb';
import { getDb } from '../testing';
import { MongoConnector } from '../mongo_connector';

// import proxied connector
const dbStub = sinon.stub();

const MongoStub: any = {
  MongoClient: {
    connect: () => ({
      db: dbStub,
      close: sinon.stub()
    })
  }
};
const MongoConnectorStub: typeof MongoConnector = proxyquire('../mongo_connector', {
  mongodb: MongoStub
}).MongoConnector;

describe('connector', () => {
  // before(async function () {

  //   // delete other
  //   const db = await getDb();
  //   const dbs = await db.admin().listDatabases();
  //   dbs.databases.forEach((tdb: any) => {
  //     if (tdb.name.substring(0, 3) === 'tmp') {
  //       MongoClient.connect(`mongodb://127.0.0.1:27017/${tdb.name}`, function (err, cdb) {
  //         cdb.dropDatabase();
  //         cdb.close();
  //       });
  //     }
  //   })
  // });

  it('will initialise url', async () => {
    //console.log(connectStub.calledOnce);
    //assert()
    const url = 'mongodb://url';

    dbStub.reset();

    const connector = new MongoConnectorStub(url, 'clara');
    await connector.connect();
    assert.equal(connector.url, url);
    assert(dbStub.calledOnce);
  });

  it('will not initialise db on error and logs error', async function() {
    //assert()
    const url = 'mongodb://url';
    const successSpy = sinon.spy();
    // spy on console.dir
    try {
      const connector = new MongoConnector(url, 'clara');
      await connector.connect();
      assert.equal(connector.db, undefined);
      // sinon.assert.calledOnce(dirStub);
     
    } catch (ex) {
      assert.equal(ex.message, 'Connection Error to mongodb://url/clara');
    } 
  });

  it('will initialise and calls back', async () => {
    //assert()
    const url = 'mongodb://url';
    const db = {};
    const startedSpy = sinon.spy();

    dbStub.returns(db);

    const connector = new MongoConnectorStub(url, 'clara');
    await connector.connect(startedSpy);
    assert.equal(connector.db, db);
    assert(startedSpy.calledOnce);
  });

  it('will create a new collection', async () => {
    //assert()
    const url = '';
    const db = {
      collection: sinon.spy()
    };

    dbStub.returns(db);

    const connector = new MongoConnectorStub(url, 'clara');
    await connector.connect();
    assert.equal(connector.db, db);

    // get a new collection
    const collectionName = 'Col';
    const col = connector.collection(collectionName);

    assert(db.collection.calledWith(collectionName));
  });

  it('can dispose database', async () => {
    const connector = new MongoConnectorStub(null, 'clara');

    const db = {
      dropDatabase: sinon.stub()
    };
    dbStub.returns(db);

    await connector.connect();
    await connector.dispose();

    sinon.assert.calledOnce(connector.db.dropDatabase as sinon.SinonStub);
    sinon.assert.calledOnce(connector.client.close as sinon.SinonStub);
  });
});
