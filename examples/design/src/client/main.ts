import 'source-map-support/register';

import {Client} from '@syncable/client';
import {ChangePlant} from '@syncable/core';
import {autorun} from 'mobx';
import socketIO from 'socket.io-client';

import {
  MFChange,
  MFSyncableObject,
  MFSyncableObjectProvider,
  User,
  mfChangePlantBlueprint,
} from '../shared';

let provider = new MFSyncableObjectProvider();
let changePlant = new ChangePlant<User, MFChange>(
  mfChangePlantBlueprint,
  provider,
);

let client = new Client<{
  user: User;
  syncableObject: MFSyncableObject;
  change: MFChange;
}>(socketIO('ws://localhost:8080'), provider, changePlant);

autorun(() => {
  let user = client.user;

  if (user) {
    console.info('tags', user.tags.map(tag => tag.name));
    console.info(JSON.stringify(user.syncable));
  }
});

(async () => {
  await client.ready;

  let user = client.user;
  let tags = client.getObjects('tag');

  for (let tag of tags) {
    client.associate(user, tag, {name: 'tag'});
  }

  for (let tag of tags) {
    client.update({
      type: 'tag:remove',
      refs: {tag: tag.ref},
      options: {},
    });
  }
})().catch(console.error);
