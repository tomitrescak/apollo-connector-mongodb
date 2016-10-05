import * as sinon from 'sinon';
import MongoEntity from '../mongo_entity';
import { withContext, withEntity, config, itWithContext, itWithEntity } from '../testing';
import * as assert from 'power-assert';
import * as proxyquire from 'proxyquire';

class CutomEntity extends MongoEntity<any> {
  name = 'customEntity';
}

describe('Testing Helpers', () => {
  describe('withEntity', () => {
    it('cleans up after error has been thrown', async () => {
      let deleteSpy: any = null;
      try {
        await withEntity(async (entity) => {
          deleteSpy = sinon.spy(entity, 'deleteMany');
          throw new Error('Error');
        });
      } catch(ex) { /**/ }
      sinon.assert.calledOnce(deleteSpy);
    });

    it('can create custom entities', async () => {
      await withEntity(async (entity) => {
        assert.equal(entity.name, 'customEntity');
      }, { entities: [{ type: CutomEntity }] });
    });

    it('can create multiple entities', async () => {
      await withEntity(async (one, two) => {
        assert.equal(one.collection.collectionName, 'One');
        assert.equal(two.collection.collectionName, 'Two');
      }, { entities: [{ name: 'One' }, { name: 'Two'}] });
    });
  });

  describe('withContext', () => {
    it('initializes context with connection, executes tests and cleans up afterwards', async function () {
      function initContext(conn: any) {
        return {
          entity: new MongoEntity(conn, 'col'),
          other: {}
        }
      }

      let inContext: any = null;
      let deleteSpy: any = null;
      await withContext(async (context) => {
        assert(context.entity);

        // check wheteher we clean up afterwards
        deleteSpy = sinon.spy(context.entity, 'deleteMany');
        inContext = context;
      }, initContext);

      sinon.assert.calledOnce(deleteSpy);
    });

    it('throws exception but also cleans up', async function () {
      function initContext(conn: any) {
        return {
          entity: new MongoEntity(conn, 'col')
        }
      }

      let inContext: any = null;
      let deleteSpy: any = null;
      try {
        await withContext(async (context) => {
          deleteSpy = sinon.spy(context.entity, 'deleteMany');
          inContext = context;

          throw new Error('Error');
        }, initContext);
      } catch (ex) {
        assert.equal(ex.message, 'Error');
      }

      sinon
        .assert
        .calledOnce(deleteSpy);
    });

    it('can run from the globally declared contextFunction', async () => {
      const initContext = sinon
        .stub()
        .returns({});
      config({ initContext });

      await withContext(() => { });

      sinon
        .assert
        .calledOnce(initContext);
    });

    it('can run in the disconnected state', async () => {
      const MongoStub = {
        MongoClient: sinon.stub()
      }
      const {withContext, config} = proxyquire('../testing', { 'mongodb': MongoStub });

      const initContext = (connector: any) => {
        assert(connector.collection());
        return {};
      };
      config({ initContext });

      await withContext((context: any) => { }, null, true);
      sinon.assert.notCalled(MongoStub.MongoClient);
    });
  });

  describe('Mocha helpers', () => {
    describe ('itWithContext', () => {
      itWithContext('runs', (context: any) => {
        assert(true);
      })
    });

    describe ('itWithEntity', () => {
      itWithEntity('runs', (context: any) => {
        assert(true);
      })
    });
  })

  describe('disposeDb', () => {
    it('closes connection', sinon.test(async function () {
      const dbSpy = {
        dropDatabase: this.spy(),
        close: this.spy()
      };
      const MongoStub = {
        MongoClient: {
          connect: this.stub().returns(dbSpy)
        }
      }
      const { getDb, disposeDb } = proxyquire('../testing', { 'mongodb': MongoStub });
      await getDb();
      await disposeDb(true);

      sinon.assert.calledOnce(dbSpy.dropDatabase);
      sinon.assert.calledOnce(dbSpy.close);

    }));
  });

});