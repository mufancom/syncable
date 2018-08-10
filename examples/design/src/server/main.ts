import 'source-map-support/register';

import {createServer} from 'http';

import {ChangePlant} from '@syncable/core';

import {
  MFChange,
  MFSyncableObjectFactory,
  mfChangePlantBlueprint,
} from '../shared';
import {MFServer} from './mf-server';

let factory = new MFSyncableObjectFactory();
let changePlant = new ChangePlant<MFChange>(mfChangePlantBlueprint);

let httpServer = createServer();

httpServer.listen(8080);

let server = new MFServer(httpServer, factory, changePlant);
