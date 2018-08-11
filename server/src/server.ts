import {EventEmitter} from 'events';
import {Server as HTTPServer} from 'http';

import {
  Change,
  ChangePlant,
  GeneralChange,
  Syncable,
  SyncableManager,
  SyncableObject,
  SyncableRef,
  UserSyncableObject,
} from '@syncable/core';
import io = require('socket.io');

import {Connection, ConnectionSocket} from './connection';

export type ViewQueryFilter = (object: SyncableObject) => boolean;

export interface ConnectionSession {
  group: string;
  userRef: SyncableRef<UserSyncableObject>;
}

export abstract class Server<
  TChange extends Change = GeneralChange,
  TViewQuery extends unknown = unknown
> extends EventEmitter {
  private server: io.Server;
  private connectionSet = new Set<Connection>();
  private groupLoadingPromiseMap = new Map<string, Promise<void>>();

  constructor(
    httpServer: HTTPServer,
    readonly manager: SyncableManager,
    protected changePlant: ChangePlant<TChange>,
  ) {
    super();

    this.server = io(httpServer);

    this.initialize().catch(error => this.emit('error', error));
  }

  abstract getViewQueryFilter(query: TViewQuery): ViewQueryFilter;

  protected abstract resolveSession(
    socket: ConnectionSocket,
  ): Promise<ConnectionSession>;

  protected abstract loadSyncables(group: string): Promise<Syncable[]>;

  private async initialize(): Promise<void> {
    this.server.on('connection', (socket: ConnectionSocket) => {
      this.initializeConnection(socket).catch(console.error);
    });
  }

  private async initializeConnection(socket: ConnectionSocket): Promise<void> {
    let {group, userRef} = await this.resolveSession(socket);

    let groupLoadingPromiseMap = this.groupLoadingPromiseMap;

    let groupLoadingPromise = groupLoadingPromiseMap.get(group);

    if (!groupLoadingPromise) {
      groupLoadingPromise = this.loadAndAddSyncables(group);
      groupLoadingPromiseMap.set(group, groupLoadingPromise);
    }

    await groupLoadingPromise;

    let connection = new Connection(socket, this);

    this.connectionSet.add(connection);

    connection.initialize(userRef).catch(console.error);
  }

  private async loadAndAddSyncables(group: string): Promise<void> {
    let syncables = await this.loadSyncables(group);

    let manager = this.manager;

    for (let syncable of syncables) {
      manager.addSyncable(syncable);
    }
  }
}
