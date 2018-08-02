import {Change, ChangePlant, UserSyncableObject} from '@syncable/core';
import io = require('socket.io');

import {Connection, ConnectionSocket} from './connection';
import {ServerContext} from './server-context';

export abstract class Server<
  TUser extends UserSyncableObject,
  TChange extends Change
> {
  private server = io();
  private connectionSet = new Set<Connection>();

  constructor(protected changePlant: ChangePlant<TChange>) {
    this.server.on('connection', socket => {
      let context = this.createContext();

      let connection = new Connection(
        socket as ConnectionSocket,
        context,
        changePlant,
      );

      this.connectionSet.add(connection);
    });
  }

  protected abstract createContext(): ServerContext<TUser>;
}
