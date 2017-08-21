import { MongoClient, Db, Collection } from 'mongodb';
import MongoEntity from './mongo_entity';

let db: Db = null;
let name = '';
let host = '127.0.0.1';
let port = '27017';
let initContext: (conn: any) => any = null;
let testServer: ITestServer;
let verbose: boolean;
let dbName = () => "tmp" + Math.floor(Math.random() * 10000);

export interface ITestingOptions {
  mongoHost?: string;
  mongoPort?: string;
  mongoDisposeTimeout?: number;
  initContext?: (conn: any) => any;
  testServer?: ITestServer;
  verbose?: boolean;
  testDbName?: () => string;
}

export function config({mongoHost, testDbName, mongoPort, verbose, initContext: ic, testServer: ts}: ITestingOptions) {
  host = mongoHost || host;
  port = mongoPort || port;
  initContext = ic || initContext;
  testServer = ts || testServer;
  verbose = verbose;
  dbName = testDbName || dbName;

}

export async function getDb() {
  if (db) {
    return db;
  }
  name = dbName();

  if (verbose) {
    console.log('New connection to ' + name);
  }

  db = await MongoClient.connect(`mongodb://${host}:${port}/${name}`);
  (global as any).db = db;

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
  const connector: any = disconnected ? fakeConnector : await getConnector();
  initContext = initContextFn || initContext;

  if (!initContext) {
    throw new Error('No initContext provided, please pass as a parameter or use global config');
  }

  const context = initContext(connector);

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
  }
}

export function itWithContext(name: string, func: (context: any) => void, initContextFn?: (conn: any) => any, disconnected?: boolean) {
  it (name, async function() {
    await withContext(async (context) => { await func(context); }, initContextFn, disconnected);
  });
}

export interface ITestServer {
  started: boolean;
  context: any;
  startTest(): any;
  stopTest(): any;
}

export async function withServer(test: (server: ITestServer) => any, server?: ITestServer): Promise<any> {
  if (server) {
    // console.log('Using local server');
    testServer = server;
  } else { 
    // console.log('Using global server');
    server = testServer;
  }
  

  if (!server) {
    throw new Error('No server provided, please pass as a parameter or use global config');
  }

  if (!server.started) {
    await server.startTest();
  }

  // execute test
  try {
    await test(server);
  } catch (ex) {
    throw ex;
  } finally {
    // find all Entities in context and clean up afterwards
    for (let key of Object.keys(server.context)) {
      if (server.context[key] && server.context[key].dispose) {
        await server.context[key].dispose({}, true);
      }
    }
  }
}

export function itWithServer(name: string, func: (context: any) => void, server?: ITestServer) {
  it (name, async function() {
    await withServer(async (context) => { await func(context); }, server);
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

export async function stopDatabase() {
  let myDb = db;
  db = null;
  if (myDb) {
    await myDb.dropDatabase();
    await myDb.close(); 
  }
}

export function stopServer() {
  if (!testServer) {
    console.error("No server to stop!")
  }
    console.log('Stopping test server');
    testServer.stopTest();
  
}


