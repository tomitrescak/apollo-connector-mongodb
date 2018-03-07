import { MongoClient, Db, Collection } from 'mongodb';
import MongoEntity from './mongo_entity';

interface CustomGlobal {
  __mongoConnectorConfig: TestConfig;
}

interface TestConfig {
  db: Db;
  name: string;
  host: string;
  port: string;
  initContext: (conn: any) => any;
  testServer: ITestServer;
  verbose: boolean;
  dbName: () => string;
}

let customGlobal: CustomGlobal = global as any;
customGlobal.__mongoConnectorConfig = {
  db: null,
  name: '',
  host: '127.0.0.1',
  port: '27017',
  initContext: null,
  testServer: null,
  verbose: false,
  dbName: () => "tmp" + Math.floor(Math.random() * 10000)
};
let glob = customGlobal.__mongoConnectorConfig;

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
  glob.host = mongoHost || glob.host;
  glob.port = mongoPort || glob.port;
  glob.initContext = ic || glob.initContext;
  glob.testServer = ts || glob.testServer;
  glob.verbose = verbose;
  glob.dbName = testDbName || glob.dbName;

}

export async function getDb() {
  if (glob.db) {
    return glob.db;
  }
  glob.name = glob.dbName();

  if (glob.verbose) {
    console.log('New connection to ' + glob.name);
  }

  let client = await MongoClient.connect(`mongodb://${glob.host}:${glob.port}`);
  glob.db = await client.db(glob.name)

  // to make sure we are working with a clear database, we drop it and reconnect
  await glob.db.dropDatabase();
  client = await MongoClient.connect(`mongodb://${glob.host}:${glob.port}`);
  glob.db = await client.db(glob.name);

  (global as any).db = glob.db;

  return glob.db;
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
  glob.initContext = initContextFn || glob.initContext;

  if (!glob.initContext) {
    throw new Error('No initContext provided, please pass as a parameter or use global config');
  }

  const context = glob.initContext(connector);

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
    glob.testServer = server;
  } else { 
    // console.log('Using global server');
    server = glob.testServer;
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
      return glob.db.collection(name);
    }
  }
}

export async function stopDatabase() {
  let myDb = glob.db;
  glob.db = null;
  if (myDb) {
    await myDb.dropDatabase();
    await myDb.close(); 
  }
}

export function stopServer() {
  if (!glob.testServer) {
    console.error("No server to stop!")
  }
    console.log('Stopping test server');
    glob.testServer.stopTest();
  
}


