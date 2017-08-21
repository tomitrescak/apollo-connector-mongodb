import { MongoClient, Db, Collection } from 'mongodb';

export default class MongoConnector {
  private mongoUrl: string;
  private db: Db;

  constructor(url: string) {
    this.mongoUrl = url;
  }

  connect(started?: Function) {
    return new Promise((resolve, error) => {
      const that = this;
      MongoClient.connect(this.mongoUrl, function (err, db) {
        if (err) {
          console.log(`Connection Error to ${that.mongoUrl} ` + err);
          return;
        }
        // console.log('Connected to MongoDB at ' + that.mongoUrl);
        that.db = db;

        if (started) {
          started();
        }
        resolve(db);
      });
    })
  }

  async disconnect() {
    await this.db.close();
  }

  async dispose() {
    await this.db.dropDatabase();
    await this.disconnect();
  }

  collection<T>(name: string): Collection<T> {
    return this.db.collection(name);
  }
}
