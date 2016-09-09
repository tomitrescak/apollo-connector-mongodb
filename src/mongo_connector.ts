import { MongoClient, Db } from 'mongodb';

export default class MongoConnector {
  private mongoUrl: string;
  private db: Db;

  constructor(url: string, started: Function) {
    this.mongoUrl = url;

    const that = this;
    MongoClient.connect(url, function (err, db) {
      if (err) { 
        return console.dir(err); 
      }
      console.log('Connected to MongoDB at ' + url);
      that.db = db;

      if (started) {
        started();
      }
    });
  }

  collection(name: string) {
    return this.db.collection(name);
  }
}
