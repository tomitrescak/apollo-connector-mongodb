import { MongoClient, Db, Collection } from "mongodb";

export class MongoConnector {
  db: Db;
  client: MongoClient;

  constructor(public url: string, public dbName: string) {}

  async connect(started?: Function) {
    try {
      this.client = await MongoClient.connect(this.url);
      this.db = await this.client.db(this.dbName);

      if (started) {
        started();
      }
    } catch (ex) {
      console.log(
        `Connection Error to ${this.url} / ${this.dbName}: ${ex.message}`
      );
      throw new Error(`Connection Error to ${this.url}/${this.dbName}`);
    }
  }

  async disconnect() {
    await this.client.close();
  }

  async dispose() {
    // console.log(this.client.close)
    await this.db.dropDatabase();
    await this.client.close();
  }

  collection<T>(name: string): Collection<T> {
    return this.db.collection(name);
  }
}

export default MongoConnector;
