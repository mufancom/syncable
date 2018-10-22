import {createSyncable, getSyncableRef} from '@syncable/core';
import {MongoClient} from 'mongodb';

import {Tag, User} from '../shared';

(async () => {
  let client = await MongoClient.connect('mongodb://localhost:27017', {
    useNewUrlParser: true,
  });

  let db = client.db('syncable-design');
  let syncablesCollection = db.collection('syncables');

  await syncablesCollection.drop();

  let adminTagSyncable = createSyncable<Tag>('tag', {
    name: 'admin',
    derivations: [],
  });

  let irrelevantTagSyncable = createSyncable<Tag>('tag', {
    name: 'irrelevant',
    derivations: [],
  });

  let userSyncable = createSyncable<User>('user', {
    name: 'vilicvane',
    tags: [getSyncableRef(adminTagSyncable)],
  });

  let syncables = [userSyncable, adminTagSyncable, irrelevantTagSyncable];

  await syncablesCollection.insertMany(syncables);
})().then(
  () => process.exit(),
  error => {
    console.error(error);
    process.exit(1);
  },
);
