// tslint:disable:import-groups

import {createServer} from 'http';

import 'source-map-support/register';

import {ChangePlant, SyncableManager} from '@syncable/core';

import {
  MFChange,
  MFSyncableObjectFactory,
  mfChangePlantBlueprint,
} from '../shared';

import {MFServer} from './mf-server';

let factory = new MFSyncableObjectFactory();

let manager = new SyncableManager(factory);
let changePlant = new ChangePlant<MFChange>(mfChangePlantBlueprint);

let httpServer = createServer();

httpServer.listen(8080);

let server = new MFServer(httpServer, manager, changePlant);