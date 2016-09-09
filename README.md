# Introduction

Connector for mongodb for apollo.
It also includes the base model for all context models.

This module is built in ES6 with no transpilation for easier debugging.
You have to use Node 6+ to use it.

```js
import { MongoConnector } from 'apollo-connector-mongodb');

const mongoURL = 'mongodb://localshot:27017/test';

const conn = new MongoConnector(mongoURL, () => {
  
  //init express and apollo
  const context = initContext(conn);
  const config = {
    schema,
    pretty : true,
    context
  };

  // launches a new express instance
  startExpress(config);
});
```

### Model

```js
class User extends BaseModel {
  method() {
    this.collection.find() ... // mogodb collection
  }
}
```

