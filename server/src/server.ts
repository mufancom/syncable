import {Server as HTTPServer} from 'http';

import {Change, ChangePlant, UserSyncableObject} from '@syncable/core';
import io = require('socket.io');

import {Connection, ConnectionSocket} from './connection';
import {ServerContext} from './server-context';

export abstract class Server<
  TUser extends UserSyncableObject,
  TChange extends Change
> {
  private server: io.Server;
  private connectionSet = new Set<Connection>();

  constructor(
    httpServer: HTTPServer,
    protected changePlant: ChangePlant<TChange>,
  ) {
    let server = (this.server = io(httpServer));

    server.on('connection', socket => {
      let context = this.createContext();

      let connection = new Connection(
        socket as ConnectionSocket,
        context,
        changePlant,
      );

      this.connectionSet.add(connection);

      connection.initialize().catch(console.error);
    });
  }

  protected abstract createContext(): ServerContext<TUser>;
}
