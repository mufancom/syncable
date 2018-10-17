import {EventEmitter} from 'events';

import {
  AbstractSyncableObject,
  AbstractSyncableObjectFactory,
  AbstractUserSyncableObject,
  BuiltInChange,
  ChangePacket,
  ChangePacketUID,
  ChangePlant,
  ChangePlantProcessingResultWithTimestamp,
  Context,
  GeneralChange,
  GeneralSyncableRef,
  IChange,
  ISyncable,
  SyncableManager,
  SyncableRef,
} from '@syncable/core';
import _ from 'lodash';
import io from 'socket.io';
import uuid from 'uuid';
import * as v from 'villa';

import {Connection, ConnectionSocket} from './connection';

export type ViewQueryFilter = (object: AbstractSyncableObject) => boolean;

export interface ConnectionSession<TViewQuery> {
  group: string;
  userRef: SyncableRef<AbstractUserSyncableObject>;
  viewQuery: TViewQuery | undefined;
}

export interface IGroupClock {
  next(): Promise<number>;
}

interface GroupInfo {
  clock: IGroupClock;
  manager: SyncableManager;
  connectionSet: Set<Connection>;
  loadingPromise: Promise<void>;
}

export abstract class AbstractServer<
  TUser extends AbstractUserSyncableObject = AbstractUserSyncableObject,
  TChange extends IChange = IChange,
  TViewQuery extends unknown = unknown
> extends EventEmitter {
  private server: io.Server;
  private groupInfoMap = new Map<string, GroupInfo>();

  private context = new Context<TUser>('server');

  constructor(
    server: io.Server,
    readonly factory: AbstractSyncableObjectFactory,
    readonly changePlant: ChangePlant<TUser, TChange>,
  ) {
    super();

    this.server = server;

    this.initialize().catch(this.error);
  }

  abstract getViewQueryFilter(query: TViewQuery): ViewQueryFilter;

  async update(
    group: string,
    change: TChange | BuiltInChange,
  ): Promise<ChangePlantProcessingResultWithTimestamp> {
    await this.initializeGroup(group);

    let packet: ChangePacket = {
      uid: uuid() as ChangePacketUID,
      ...(change as GeneralChange),
    };

    return this._applyChangePacket(group, packet, this.context);
  }

  applyChangePacket(
    group: string,
    packet: ChangePacket,
    context: Context<TUser>,
  ): void {
    this._applyChangePacket(group, packet, context).catch(error =>
      this.emit('error', error),
    );
  }

  getNextTimestamp(group: string): Promise<number> {
    let {clock} = this.groupInfoMap.get(group)!;
    return clock.next();
  }

  protected abstract createGroupClock(group: string): IGroupClock;

  protected abstract resolveSession(
    socket: ConnectionSocket,
  ): Promise<ConnectionSession<TViewQuery>>;

  protected abstract loadSyncables(group: string): Promise<ISyncable[]>;

  protected abstract saveSyncables(
    updates: ISyncable[],
    creations: ISyncable[],
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

    let groupInfo = await this.initializeGroup(group);

    let connection = new Connection(group, socket, this, groupInfo.manager);

    groupInfo.connectionSet.add(connection);

    connection.initialize(userRef, viewQuery).catch(console.error);
  }

  private async initializeGroup(group: string): Promise<GroupInfo> {
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

    return groupInfo;
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

  private async _applyChangePacket(
    group: string,
    packet: ChangePacket,
    context: Context<TUser>,
  ): Promise<ChangePlantProcessingResultWithTimestamp> {
    let info = this.groupInfoMap.get(group);

    if (!info) {
      throw new Error(
        `Syncable group "${info}" has not been initialized on this instance`,
      );
    }

    let {manager, clock} = info;

    let timestamp = await clock.next();

    let refDict = packet.refs;

    let syncableObjectOrCreationRefDict = _.mapValues(
      refDict,
      (ref: GeneralSyncableRef) =>
        'creation' in ref && ref.creation
          ? ref
          : manager.requireSyncableObject(ref),
    );

    let result = this.changePlant.process(
      packet,
      syncableObjectOrCreationRefDict,
      context,
      timestamp,
    );

    let {updates: updateDict, creations, removals} = result;

    for (let {snapshot} of Object.values(updateDict)) {
      manager.updateSyncable(snapshot);
    }

    for (let syncable of creations) {
      manager.addSyncable(syncable);
    }

    for (let ref of removals) {
      manager.removeSyncable(ref);
    }

    await this.saveAndBroadcastChangeResult(group, result);

    return result;
  }

  private async saveAndBroadcastChangeResult(
    group: string,
    result: ChangePlantProcessingResultWithTimestamp,
  ): Promise<void> {
    return v.lock(group, async () => {
      let {updates: updateDict, creations, removals} = result;

      let updates = Object.values(updateDict).map(update => update.snapshot);

      await this.saveSyncables(updates, creations, removals);

      let {connectionSet} = this.groupInfoMap.get(group)!;

      for (let connection of connectionSet) {
        connection.handleChangeResult(result);
      }
    });
  }
}
