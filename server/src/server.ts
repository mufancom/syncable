import {EventEmitter} from 'events';
import {Server as HTTPServer} from 'http';

import {
  Change,
  ChangePlant,
  ChangePlantProcessingResultWithTimestamp,
  GeneralChange,
  Syncable,
  SyncableManager,
  SyncableObject,
  SyncableObjectFactory,
  SyncableRef,
  UserSyncableObject,
} from '@syncable/core';
import io from 'socket.io';

import {Connection, ConnectionSocket} from './connection';

export type ViewQueryFilter = (object: SyncableObject) => boolean;

export interface ConnectionSession<TViewQuery> {
  group: string;
  userRef: SyncableRef<UserSyncableObject>;
  viewQuery: TViewQuery | undefined;
}

export interface GroupClock {
  next(): Promise<number>;
}

interface GroupInfo {
  clock: GroupClock;
  manager: SyncableManager;
  connectionSet: Set<Connection>;
  loadingPromise: Promise<void>;
}

export abstract class Server<
  TChange extends Change = GeneralChange,
  TViewQuery extends unknown = unknown
> extends EventEmitter {
  private server: io.Server;
  private groupInfoMap = new Map<string, GroupInfo>();

  constructor(
    httpServer: HTTPServer,
    readonly factory: SyncableObjectFactory,
    readonly changePlant: ChangePlant<TChange>,
  ) {
    super();

    this.server = io(httpServer);

    this.initialize().catch(this.error);
  }

  abstract getViewQueryFilter(query: TViewQuery): ViewQueryFilter;

  saveAndBroadcastChangeResult(
    group: string,
    result: ChangePlantProcessingResultWithTimestamp,
  ): void {
    this._saveAndBroadcastChangeResult(group, result).catch(error =>
      this.emit('error', error),
    );
  }

  getNextTimestamp(group: string): Promise<number> {
    let {clock} = this.groupInfoMap.get(group)!;
    return clock.next();
  }

  protected abstract createGroupClock(group: string): GroupClock;

  protected abstract resolveSession(
    socket: ConnectionSocket,
  ): Promise<ConnectionSession<TViewQuery>>;

  protected abstract loadSyncables(group: string): Promise<Syncable[]>;

  protected abstract saveSyncables(
    syncables: Syncable[],
    removals: SyncableRef[],
  ): Promise<void>;

  protected error = (error: Error): void => {
    console.error(error);
    this.emit('error', error);
  };

  private async initialize(): Promise<void> {
    this.server.on('connection', (socket: ConnectionSocket) => {
      this.initializeConnection(socket).catch(console.error);
    });
  }

  private async initializeConnection(socket: ConnectionSocket): Promise<void> {
    let {group, userRef, viewQuery} = await this.resolveSession(socket);

    let groupInfoMap = this.groupInfoMap;

    let groupInfo = groupInfoMap.get(group);

    if (!groupInfo) {
      let clock = this.createGroupClock(group);
      let manager = new SyncableManager(this.factory);
      let loadingPromise = this.loadAndAddSyncables(group, manager);

      groupInfo = {
        clock,
        manager,
        connectionSet: new Set(),
        loadingPromise,
      };

      groupInfoMap.set(group, groupInfo);
    }

    await groupInfo.loadingPromise;

    let connection = new Connection(
      group,
      socket,
      this,
      groupInfo.clock,
      groupInfo.manager,
    );

    groupInfo.connectionSet.add(connection);

    connection.initialize(userRef, viewQuery).catch(console.error);
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

  private async _saveAndBroadcastChangeResult(
    group: string,
    result: ChangePlantProcessingResultWithTimestamp,
  ): Promise<void> {
    let {updates: updateDict, creations, removals} = result;

    let syncables = [
      ...Object.values(updateDict).map(update => update.snapshot),
      ...creations,
    ];

    await this.saveSyncables(syncables, removals);

    let {connectionSet} = this.groupInfoMap.get(group)!;

    for (let connection of connectionSet) {
      connection.handleChangeResult(result);
    }
  }
}
