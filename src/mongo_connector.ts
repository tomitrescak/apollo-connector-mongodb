import { MongoClient, Db, Collection } from 'mongodb';

export default class MongoConnector {
  private mongoUrl: string;
  private db: Db;

  constructor(url: string) {
    this.mongoUrl = url;
  }

  connect(started?: Function) {
    return new Promise((error, resolve) => {
      const that = this;
      MongoClient.connect(this.mongoUrl, function (err, db) {
        if (err) {
          error(err);
          return console.dir(err);
        }
        console.log('Connected to MongoDB at ' + that.mongoUrl);
        that.db = db;

        if (started) {
          started();
        }

        resolve(this);
      });
    })
  }

  collection<T>(name: string): Collection<T> {
    return this.db.collection(name);
  }
}
