// tslint:disable:import-groups

import 'source-map-support/register';

import {Client} from '@syncable/client';
import {ChangePlant} from '@syncable/core';
import {autorun} from 'mobx';

import {
  MFChange,
  MFSyncableObjectFactory,
  User,
  mfChangePlantBlueprint,
} from '../shared';

let factory = new MFSyncableObjectFactory();
let changePlant = new ChangePlant<MFChange>(mfChangePlantBlueprint);

let client = new Client<User, MFChange>(
  'ws://localhost:8080',
  factory,
  changePlant,
);

autorun(() => {
  let user = client.context.user;

  if (user) {
    console.log('user tags', user.tags[0].name);
  }
});
