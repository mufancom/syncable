import {createServer} from 'http';

import 'source-map-support/register';

import {ChangePlant} from '@syncable/core';
import socketIO from 'socket.io';

import {
  MFChange,
  MFSyncableObjectProvider,
  User,
  mfChangePlantBlueprint,
} from '../shared';

import {MFServer} from './mf-server';

let provider = new MFSyncableObjectProvider();

let changePlant = new ChangePlant<User, MFChange>(
  mfChangePlantBlueprint,
  provider,
);

let httpServer = createServer();

httpServer.listen(8080);

let socketServer = socketIO(httpServer);

let server = new MFServer(socketServer, provider, changePlant);

server.on('error', console.error);
