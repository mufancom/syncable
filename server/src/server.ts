import {EventEmitter} from 'events';

import {
  ChangePacket,
  ChangePacketId,
  ChangePlant,
  ChangePlantProcessingResultWithTimestamp,
  Context,
  GeneralChange,
  GeneralSyncableRef,
  IChange,
  INotification,
  ISyncable,
  ISyncableObject,
  ISyncableObjectProvider,
  IUserSyncableObject,
  NotificationPacket,
  SyncableManager,
  SyncableRef,
} from '@syncable/core';
import _ from 'lodash';
import {Server as SocketServer} from 'socket.io';
import uuid from 'uuid';
import * as v from 'villa';

import {Connection, ConnectionSocket} from './connection';

export type ViewQueryFilter<T extends ISyncableObject = ISyncableObject> = (
  object: T,
) => boolean;

export interface ConnectionSession<TViewQuery> {
  group: string;
  userRef: SyncableRef<IUserSyncableObject>;
  viewQuery: TViewQuery | undefined;
}

export interface IGroupClock {
  next(): Promise<number>;
}

interface GroupInfo<TServerGenerics extends ServerGenericParams> {
  clock: IGroupClock;
  manager: SyncableManager;
  connectionSet: Set<Connection<TServerGenerics>>;
  loadingPromise: Promise<void>;
}

export interface ServerGenericParams {
  user: IUserSyncableObject;
  syncableObject: ISyncableObject;
  change: IChange;
  viewQuery: unknown;
  notification: INotification;
}

interface Server<TGenericParams extends ServerGenericParams> {
  on(event: 'error', listener: (error: Error) => void): this;
  on(
    event: 'notify',
    listener: (
      packet: NotificationPacket<TGenericParams['notification']>,
    ) => void,
  ): this;

  emit(event: 'error', error: Error): boolean;
  emit(
    event: 'notify',
    packet: NotificationPacket<TGenericParams['notification']>,
  ): boolean;
}

export interface ServerOptions<TSyncable extends ISyncable> {
  builtInSyncables?: TSyncable[];
}

abstract class Server<
  TGenericParams extends ServerGenericParams
> extends EventEmitter {
  private server: SocketServer;
  private groupInfoMap = new Map<string, GroupInfo<TGenericParams>>();

  private context = new Context<TGenericParams['user']>('server');

  constructor(
    server: SocketServer,
    readonly provider: ISyncableObjectProvider,
    readonly changePlant: ChangePlant<{
      user: TGenericParams['user'];
      change: TGenericParams['change'];
      notification: TGenericParams['notification'];
    }>,
    private options: ServerOptions<
      TGenericParams['syncableObject']['syncable']
    > = {},
  ) {
    super();

    this.server = server;

    this.initialize().catch(this.error);
  }

  abstract getViewQueryFilter(
    query: TGenericParams['viewQuery'],
    context: Context,
  ): ViewQueryFilter<TGenericParams['syncableObject']>;

  async update(
    group: string,
    change: TGenericParams['change'],
  ): Promise<ChangePlantProcessingResultWithTimestamp> {
    await this.initializeGroup(group);

    let packet: ChangePacket = {
      id: uuid() as ChangePacketId,
      ...(change as GeneralChange),
    };

    return this._applyChangePacket(group, packet, this.context);
  }

  applyChangePacket(
    group: string,
    packet: ChangePacket,
    context: Context<TGenericParams['user']>,
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
  ): Promise<ConnectionSession<TGenericParams['viewQuery']>>;

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

    let connection = new Connection<TGenericParams>(
      group,
      socket,
      this,
      groupInfo.manager,
    );

    groupInfo.connectionSet.add(connection);

    connection.initialize(userRef, viewQuery).catch(console.error);
  }

  private async initializeGroup(
    group: string,
  ): Promise<GroupInfo<TGenericParams>> {
    let groupInfoMap = this.groupInfoMap;

    let groupInfo = groupInfoMap.get(group);

    if (!groupInfo) {
      let clock = this.createGroupClock(group);
      let manager = new SyncableManager(this.provider);
      let {builtInSyncables = []} = this.options;

      for (let builtInSyncable of builtInSyncables) {
        manager.addSyncable(builtInSyncable);
      }

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
    context: Context<TGenericParams['user']>,
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
        ref
          ? 'creation' in ref && ref.creation
            ? ref
            : manager.requireSyncableObject(ref)
          : undefined,
    );

    let result = this.changePlant.process(
      packet,
      syncableObjectOrCreationRefDict,
      context,
      timestamp,
    );

    let {updates: updateDict, creations, removals, notificationPacket} = result;

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

    if (notificationPacket) {
      this.emit('notify', notificationPacket);
    }

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

export interface IServer<TGenericParams extends ServerGenericParams>
  extends Server<TGenericParams> {}

export const AbstractServer = Server;
