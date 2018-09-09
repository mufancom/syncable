// tslint:disable:import-groups

import 'source-map-support/register';

import {Client} from '@syncable/client';
import {ChangePlant} from '@syncable/core';
import {autorun} from 'mobx';

import {
  MFChange,
  MFSyncableObject,
  MFSyncableObjectFactory,
  Tag,
  User,
  mfChangePlantBlueprint,
} from '../shared';

let factory = new MFSyncableObjectFactory();
let changePlant = new ChangePlant<User, MFChange>(mfChangePlantBlueprint);

let client = new Client<User, MFSyncableObject, MFChange>(
  'ws://localhost:8080',
  factory,
  changePlant,
);

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
  let tags = client.getObjects<Tag>('tag');

  for (let tag of tags) {
    client.associate(user, tag, {requisite: true, name: 'tag'});
  }

  for (let tag of tags) {
    client.update({
      type: 'tag:remove',
      refs: {tag: tag.ref},
      options: {},
    });
  }
})().catch(console.error);
