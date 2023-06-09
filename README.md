# Introduction

Connector for mongodb, focues on its use with GraphQL (Apollo) and facilitates:

1. Mongo connection
2. **Result caching** - Entities use Facebook's DataLoader to handle batch processing and caching of query results
3. **Unit testing** - handy `withEntity` function provides seamless API for unit and integration testing 

This module is built in ES6 with commonjs modules. **You have to use Node 6+ to use it.**

# Breaking Changes

- Using mongodb 4.0
- find function using standard API

# Quick Start

```js
import { MongoConnector, MongoEntity } from 'apollo-connector-mongodb');
import lruCache from 'lru-cache';

const mongoURL = 'mongodb://localshot:27017/test';

const conn = new MongoConnector(mongoURL, () => {
  
  // create your entities (collections)
  const users = new MongoEntity(conn, 'users', { cacheMap: lruCache });
  const context = {
    users
  }

  //init express and apollo
  const config = {
    schema,
    context
  };

  // launches a new express instance
  startExpress(config);
});
```

# API

`MongoEntity` provides following functions:

* `find(selector: Object, fields?: Object, skip?: number, limit?: number, timeout?: number): Cursor<T>`
* `findOne(selector: Object, options?: FindOneOptions): Promise<T>`
* `findOneCached(loader: DataLoader<string, T>, key: string, fieldSelector?: Object): Promise<T>` - finds a record using a efined loader and inserts it into cache, with selector you can further filter returned fields
* `findOneCachedById(id: string, fieldSelector?: Object): Promise<T>`
* `findManyCached(loader: DataLoader<string, T[]>, key: string, fieldSelector?: Object): Promise<T[]>`
* `findAllCached(fieldSelector?: Object): Promise<T[]>`
* `insert(document: T): Promise<InsertOneWriteOpResult>` - also invalidates insert caches
* `insertMany(document: T[]): Promise<InsertOneWriteOpResult>` - also invalidates insert caches
* `delete(selector: Object, many = false): Promise<DeleteWriteOpResultObject>` - also invalidates insert caches
* `update(selector: Object, update: Object, options?: ReplaceOneOptions): Promise<UpdateWriteOpResult>` - also invalidates update caches

Example

```javascript
const users = new MongoEntity(conn, 'users', { cacheMap: lruCache });
const user = await users.findOneCachedById('1', { profile: 1, email: 1 });
```

# Unit Testing

`MongoEntity` provides a handy `withEntity` function that facilitates unit testing. 

We are going to test a following implementation of GraphQL Apollo query:

```javascript
solution(root: any, { scheduleId, practicalId, exerciseId, userId }: any, { user, access, solutions }: App.Server.Context): Promise<App.Collections.ISolutionDAO> {
  if (access.playsRoles(user, ['admin', 'tutor'])) {
    // admin or tutor possibly view their own solutions
    userId = userId ? userId : user._id;
  } else {
    // non admins and tutors are bound to see their own solutions
    userId = user._id;
  }
  return solutions.solution(scheduleId, practicalId, exerciseId, userId);
}
```

And here is the test

```javascript
import { withEntity } from 'apollo-connector-mongodb';
import sinon from 'sinon';

describe('Solution Schema', () => {
  describe('Queries', () => {
    describe('solution', () => {
      it ('returns solution of a given user for admin and tutor, otherwise only from server user. @integration', async () => {
        await withEntity(async (solutions) => {
          // init context
          const context {
            user: { _id: 1 },
            solutions,
            access: { playsRoles: sinon.stub().returns(false); }
          };

          // setup
          await solutions.insertMany([
            { scheduleId: 1, practicalId: 2, exerciseId: 3, userId: 1 },
            { scheduleId: 1, practicalId: 2, exerciseId: 3, userId: 2 }
          ]);

          // query for someone elses work
          const params = { scheduleId: 1, practicalId: 2, exerciseId: 3, userId: 4 };
          const prohibitedResult = await solutionSchema.queries.solution(null, params, context);

          // it returns user result instead
          expect(prohibitedResult).to.deep.equal({ scheduleId: 1, practicalId: 2, exerciseId: 3, userId: 1 });
        }, { entities: [{ type: SolutionsModel }]});
      })
    });
  });
});
```

Please note that no database initialisation is necessary, everything is handled automatically. Even creation of the test database and it's deletion.
Following is the definition of `withEntity` functions and the realted options:

```javascript
interface TestOption<T> {
  // data to be inserted before the test
  data?: T[];
  // collection name
  name?: string;
  // custom entity type (child of MongoEntity) 
  type: any,
  // exisitng instance of MongoEntity
  entity?: MongoEntity<T>;
}
interface TestOptions {
  entities?: TestOption<any>[];
}


withEntity<T>(test: (...entity: MongoEntity<T>[]) => any, options?: TestOptions): Promise<any>;
``` 

# Custom Entitites

Entities should serve as base model for your custom models

```js
class User extends MongoEntity {
  method() {
    this.collection.find() ... // mogodb collection
  }
}
```

