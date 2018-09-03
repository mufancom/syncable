// tslint:disable:import-groups

import {createServer} from 'http';

import 'source-map-support/register';

import {ChangePlant} from '@syncable/core';

import {
  MFChange,
  MFSyncableObjectFactory,
  User,
  mfChangePlantBlueprint,
} from '../shared';

import {MFServer} from './mf-server';

let factory = new MFSyncableObjectFactory();

let changePlant = new ChangePlant<User, MFChange>(mfChangePlantBlueprint);

let httpServer = createServer();

httpServer.listen(8080);

let server = new MFServer(httpServer, factory, changePlant);

server.on('error', console.error);
