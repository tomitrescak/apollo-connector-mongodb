import { MongoClient, Db, Collection } from 'mongodb';
import MongoEntity from './mongo_entity';

let db: Db = null;
let name = '';
let host = '127.0.0.1';
let port = '27017';
let disposeTimeout = 200;
let timeoutId: number = null;
let initContext: (conn: any) => any = null;

export interface ITestingOptions {
  mongoHost?: string;
  mongoPort?: string;
  mongoDisposeTimeout?: number;
  initContext?: (conn: any) => any;
}

export function config({mongoHost, mongoPort, mongoDisposeTimeout, initContext: ic}: ITestingOptions) {
  host = mongoHost || host;
  port = mongoPort || port;
  disposeTimeout = mongoDisposeTimeout || disposeTimeout;
  initContext = ic;
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
  type?: any,
  entity?: MongoEntity<T>;
}
export interface TestOptions {
  entities?: TestOption<any>[];
}


export async function withEntity(test: (...entity: any[]) => any, options?: TestOptions): Promise<any> {

  // stop disposal
  if (timeoutId != null) {
    clearTimeout(timeoutId);
  }

  const connector: any = await getConnector();

  let entities: any[] = [];
  if (options && options.entities) {
    for (let i = 0; i < options.entities.length; i++) {
      // init entity
      const option = options.entities[i];
      const name = option.name;
      const type = option.type ? option.type : MongoEntity;
      
      let entity = new type(connector, name ? name : `test_${i}`);
      entities.push(entity);

      // init data
      if (options.entities[i].data) {
        for (let data of options.entities[i].data) {
          await entity.insertOne(data);
        }
      }
    }
  } else {
    entities.push(new MongoEntity(connector, 'test'));
  }

  // check for initial data

  // execute test
  try {
    await test(...entities);
  } catch (ex) {
    throw ex;
  } finally {
    // clean up
    await entities.forEach(e => e.deleteMany({}));

    // start dispose
    disposeDb();
  }
}

export function itWithEntity(name: string, func: (...entity: any[]) => any, options?: TestOptions) {
  it (name, async function() {
    await withEntity(async (context) => { await func(context); }, options);
  });
}

const fakeConnector = {
  collection() { return {
    deleteMany() {},
    insert() {},
    find() {},
    findOne() {}
  } }
}

export async function withContext(test: (context: any) => any, initContextFn?: (conn: any) => any, disconnected = false): Promise<any> {
  // stop disposal
  if (timeoutId != null) {
    clearTimeout(timeoutId);
  }

  const connector: any = disconnected ? fakeConnector : await getConnector();
  const context = initContextFn ? initContextFn(connector) : initContext(connector);

  // execute test
  try {
    await test(context);
  } catch (ex) {
    throw ex;
  } finally {
    // find all Entities in context and clean up afterwards
    for (let key of Object.keys(context)) {
      if (context[key] && context[key].dispose) {
        await context[key].dispose({}, true);
      }
    }
    // start dispose
    disposeDb();
  }
}

export function itWithContext(name: string, func: (context: any) => void, initContextFn?: (conn: any) => any, disconnected?: boolean) {
  it (name, async function() {
    await withContext(async (context) => { await func(context); }, initContextFn, disconnected);
  });
}

export async function getConnector() {
  let myDb = await getDb();
  return {
    collection(name: string) {
      return db.collection(name);
    }
  }
}

async function dropDatabase() {
  let myDb = db;
  db = null;
  if (myDb) {
    console.log('tearing down db');
    await myDb.dropDatabase();
    await myDb.close(); 
  }
}

export function disposeDb(immediate = false) {
  if (immediate) {
    dropDatabase();
  }
  // we let other tests to pickup this connection
  timeoutId = setTimeout(dropDatabase, disposeTimeout);
}

