import {EventEmitter} from 'events';
import {Server as HTTPServer} from 'http';

import {
  Change,
  ChangePlant,
  GeneralChange,
  Syncable,
  SyncableManager,
  SyncableObject,
  SyncableObjectFactory,
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

interface GroupInfo {
  manager: SyncableManager;
  loadingPromise: Promise<void>;
}

export abstract class Server<
  TChange extends Change = GeneralChange,
  TViewQuery extends unknown = unknown
> extends EventEmitter {
  private server: io.Server;
  private connectionSet = new Set<Connection>();
  private groupInfoMap = new Map<string, GroupInfo>();

  constructor(
    httpServer: HTTPServer,
    protected factory: SyncableObjectFactory,
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

    let groupInfoMap = this.groupInfoMap;

    let groupInfo = groupInfoMap.get(group);

    if (!groupInfo) {
      let manager = new SyncableManager(this.factory);
      let loadingPromise = this.loadAndAddSyncables(group, manager);

      groupInfo = {
        manager,
        loadingPromise,
      };

      groupInfoMap.set(group, groupInfo);
    }

    await groupInfo.loadingPromise;

    let connection = new Connection(socket, this, groupInfo.manager);

    this.connectionSet.add(connection);

    connection.initialize(userRef).catch(console.error);
  }

  private async loadAndAddSyncables(
    group: string,
    manager: SyncableManager,
  ): Promise<void> {
    let syncables = await this.loadSyncables(group);

    for (let syncable of syncables) {
      manager.addSyncable(syncable);
    }
  }
}
