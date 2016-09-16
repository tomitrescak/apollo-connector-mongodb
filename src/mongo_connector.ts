import { MongoClient, Db, Collection } from 'mongodb';

export default class MongoConnector {
  private mongoUrl: string; 
  private db: Db;

  constructor(url: string, started: Function) {
    this.mongoUrl = url;

    if (started) {
      this.connect(started);
    }
  }

  connect(started?: Function) {
    const that = this;
    MongoClient.connect(this.mongoUrl, function (err, db) {
      if (err) { 
        return console.dir(err); 
      }
      console.log('Connected to MongoDB at ' + that.mongoUrl);
      that.db = db;

      if (started) {
        started();
      }
    });
  }

  collection<T>(name: string): Collection<T> {
    return this.db.collection(name);
  }
}
