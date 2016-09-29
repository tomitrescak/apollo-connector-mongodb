import { MongoClient, Db, Collection } from 'mongodb';
import MongoEntity from './mongo_entity';

let db: Db = null;
let name = '';
let host = '127.0.0.1';
let port = '27017';
let disposeTimeout = 200;
let timeoutId: number = null;

export function config(mongoHost: string = host, mongoPort: string = port, mongoDisposeTimeout: number = disposeTimeout) {
  host = mongoHost;
  port = mongoPort;
  disposeTimeout = mongoDisposeTimeout;
}

export async function getDb() {
  if (db) {
    return db;
  }
  name = "tmp" + Math.floor(Math.random() * 10000);

  console.log('New connection to ' + name);

  db = await MongoClient.connect(`mongodb://${host}:${port}/${name}`);
  global.db = db;

  return db;
}

export interface TestOption<T> {
  data?: T[];
  name?: string;
  entity?: MongoEntity<T>;
}
export interface TestOptions {
  entities?: TestOption<any>[];
}


export async function withEntity<T>(test: (...entity: MongoEntity<T>[]) => any, options?: TestOptions): Promise<any> {

  // stop disposal
  if (timeoutId != null) {
    clearTimeout(timeoutId);
  }

  const connector: any = await getConnector();

  let entities: any[] = [];
  if (options && options.entities) {
    for (let i = 0; i < options.entities.length; i++) {
      // init entity
      const name = options.entities[i].name;
      let entity = new MongoEntity<T>(connector, name ? name : `test_${i}`);
      entities.push(entity);

      // init data
      if (options.entities[i].data) {
        for (let data of options.entities[i].data) {
          await entity.insert(data);
        }
      }
    }
  } else {
    entities.push(new MongoEntity<T>(connector, 'test'));
  }

  // check for initial data

  // execute test
  try {
    await test(...entities);
  } catch (ex) {
    throw ex;
  } finally {
    // clean up
    await entities.forEach(e => e.delete({}, true));

    // start dispose
    disposeDb();
  }
}

export async function getConnector() {
  let myDb = await getDb();
  return {
    collection(name: string) {
      return db.collection(name);
    }
  }
}

export function disposeDb() {
  // we let other tests to pickup this connection
  timeoutId = setTimeout(async () => {
    let myDb = db;
    db = null;
    if (myDb) {
      console.log('tearing down db');
      await myDb.dropDatabase();
      await myDb.close();
    }
  }, disposeTimeout)

}

