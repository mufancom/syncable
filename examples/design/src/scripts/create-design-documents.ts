import {MongoClient} from 'mongodb';
import uuid from 'uuid';

import {UserId, UserSyncable} from '../shared';

(async () => {
  let client = await MongoClient.connect('mongodb://localhost:27017', {
    useNewUrlParser: true,
  });

  let db = client.db('syncable-design');
  let syncablesCollection = db.collection('syncables');

  await syncablesCollection.drop();

  let user: UserSyncable = {
    _id: uuid() as UserId,
    _type: 'user',
    _timestamp: 0,
    name: 'vilicvane',
  };

  let syncables = [user];

  await syncablesCollection.insertMany(syncables);

  console.log(await syncablesCollection.find({}).toArray());
})().then(
  () => process.exit(),
  error => {
    console.error(error);
    process.exit(1);
  },
);
