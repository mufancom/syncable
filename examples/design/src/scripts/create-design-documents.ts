import {createSyncable, getSyncableRef} from '@syncable/core';
import {MongoClient} from 'mongodb';

import {TagSyncable, UserSyncable} from '../shared';

(async () => {
  let client = await MongoClient.connect('mongodb://localhost:27017', {
    useNewUrlParser: true,
  });

  let db = client.db('syncable-design');
  let syncablesCollection = db.collection('syncables');

  await syncablesCollection.drop();

  let userSyncable = createSyncable<UserSyncable>('user', {
    name: 'vilicvane',
  });

  let adminTagSyncable = createSyncable<TagSyncable>('tag', {
    name: 'admin',
    derivations: [],
  });

  let irrelevantTagSyncable = createSyncable<TagSyncable>('tag', {
    name: 'irrelevant',
    derivations: [],
  });

  userSyncable._associations = [
    {name: 'tag', requisite: true, ref: getSyncableRef(adminTagSyncable)},
  ];

  let syncables = [userSyncable, adminTagSyncable, irrelevantTagSyncable];

  await syncablesCollection.insertMany(syncables);
})().then(
  () => process.exit(),
  error => {
    console.error(error);
    process.exit(1);
  },
);
