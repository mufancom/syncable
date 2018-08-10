import {Client} from '@syncable/client';
import {ChangePlant} from '@syncable/core';
import 'source-map-support/register';

import {
  MFChange,
  MFSyncableObjectFactory,
  mfChangePlantBlueprint,
} from '../shared';

let factory = new MFSyncableObjectFactory();
let changePlant = new ChangePlant<MFChange>(mfChangePlantBlueprint);

let client = new Client('ws://localhost:8080', factory, changePlant);
