// tslint:disable:import-groups

import 'source-map-support/register';

import {Client} from '@syncable/client';
import {ChangePlant} from '@syncable/core';
import {autorun} from 'mobx';

import {
  MFChange,
  MFSyncableObject,
  MFSyncableObjectFactory,
  User,
  mfChangePlantBlueprint,
} from '../shared';

let factory = new MFSyncableObjectFactory();
let changePlant = new ChangePlant<MFChange>(mfChangePlantBlueprint);

let client = new Client<User, MFSyncableObject, MFChange>(
  'ws://localhost:8080',
  factory,
  changePlant,
);

autorun(() => {
  let user = client.user;

  if (user) {
    console.log('tags', user.tags.map(tag => tag.name));
    console.log(JSON.stringify(user.syncable));
  }
});

(async () => {
  await client.ready;

  let user = client.user;
  let tags = client.objects.filter(object => object.type === 'tag');

  for (let tag of tags) {
    client.associate(user, tag, {requisite: true});
  }

  // console.log(client.objects);

  // let user = client.context.user;

  // let tag = user.tags[0];

  // if (tag) {
  //   client.unassociate(user, tag);
  // }
})().catch(console.error);
