import {EventEmitter} from 'events';

import {
  ChangePacket,
  ChangePacketId,
  ChangePlant,
  Context,
  GeneralChange,
  GeneralSyncableRef,
  IChange,
  INotification,
  ISyncable,
  ISyncableObject,
  ISyncableObjectProvider,
  IUserSyncableObject,
  InitialData,
  NotificationPacket,
  SnapshotData,
  SyncableId,
  SyncableManager,
  SyncableRef,
  SyncingData,
} from '@syncable/core';
import * as DeepDiff from 'deep-diff';
import _ from 'lodash';
import uuid from 'uuid';

import {ClientSocket} from './@client-socket';

export interface ClientAssociateOptions {
  name?: string;
  secures?: boolean;
}

export interface ClientGenericParams {
  user: IUserSyncableObject;
  syncableObject: ISyncableObject;
  change: IChange;
  notification: INotification;
}

export class Client<
  TGenericParams extends ClientGenericParams = ClientGenericParams
> extends EventEmitter {
  readonly context: Context<TGenericParams['user']>;
  readonly ready: Promise<void>;

  private manager: SyncableManager;
  private socket: ClientSocket<TGenericParams['user']>;

  private pendingChangePackets: ChangePacket[] = [];
  private syncableSnapshotMap = new Map<SyncableId, ISyncable>();

  constructor(
    socket: SocketIOClient.Socket,
    provider: ISyncableObjectProvider,
    changePlant: ChangePlant<{
      user: TGenericParams['user'];
      change: TGenericParams['change'];
      notification: TGenericParams['notification'];
    }>,
  );
  constructor(
    socket: SocketIOClient.Socket,
    provider: ISyncableObjectProvider,
    private changePlant: ChangePlant,
  ) {
    super();

    this.context = new Context('user', 'client');
    this.manager = new SyncableManager(provider);

    this.socket = socket as ClientSocket<TGenericParams['user']>;

    this.ready = new Promise<void>(resolve => {
      this.socket.on('syncable:initialize', data => {
        this.manager.clear();
        this.onInitialize(data);
        resolve();
      });
    });

    this.socket.on('syncable:sync', data => {
      this.onSync(data);
    });
  }

  get user(): TGenericParams['user'] {
    return this.context.user;
  }

  getObjects(): TGenericParams['syncableObject'][];
  getObjects<
    TType extends TGenericParams['syncableObject']['syncable']['_type']
  >(
    type: TType,
  ): Extract<TGenericParams['syncableObject'], {syncable: {_type: TType}}>[];
  getObjects(type?: string): TGenericParams['syncableObject'][] {
    return this.manager.getSyncableObjects(
      type,
    ) as TGenericParams['syncableObject'][];
  }

  getObject<TRef extends TGenericParams['syncableObject']['ref']>(
    ref: TRef,
  ): Extract<TGenericParams['syncableObject'], {ref: TRef}> | undefined {
    return this.manager.getSyncableObject(ref as SyncableRef) as
      | Extract<TGenericParams['syncableObject'], {ref: TRef}>
      | undefined;
  }

  requireObject<TRef extends TGenericParams['syncableObject']['ref']>(
    ref: TRef,
  ): Extract<TGenericParams['syncableObject'], {ref: TRef}> {
    return this.manager.requireSyncableObject(ref as SyncableRef) as Extract<
      TGenericParams['syncableObject'],
      {ref: TRef}
    >;
  }

  update(change: TGenericParams['change']): void {
    let packet: ChangePacket = {
      id: uuid() as ChangePacketId,
      createdAt: Date.now(),
      ...(change as GeneralChange),
    };

    this.applyChangePacket(packet);
    this.pushChangePacket(packet);
  }

  private onInitialize({
    userRef,
    ...data
  }: InitialData<TGenericParams['user']>): void {
    this.onSnapshotData(data, false);

    let user = this.manager.requireSyncableObject(userRef);
    this.context.initialize(user);
  }

  private onSync(data: SyncingData): void {
    if ('source' in data) {
      let matched = this.shiftChangePacket(data.source.id);

      this.onSnapshotData(data, matched);

      for (let {ref, diffs} of data.updates) {
        this.onUpdateChange(ref, diffs);
      }

      for (let packet of this.pendingChangePackets) {
        this.applyChangePacket(packet);
      }
    } else {
      this.onSnapshotData(data, false);
    }
  }

  private onSnapshotData(
    {syncables, removals}: SnapshotData,
    update: boolean,
  ): void {
    for (let syncable of syncables) {
      this.onUpdateCreate(syncable, update);
    }

    for (let ref of removals) {
      this.onUpdateRemove(ref);
    }
  }

  private onUpdateCreate(syncable: ISyncable, update: boolean): void {
    this.manager.addSyncable(syncable, update);

    let snapshot = _.cloneDeep(syncable);

    this.syncableSnapshotMap.set(syncable._id, snapshot);
  }

  private onUpdateRemove(ref: SyncableRef): void {
    this.manager.removeSyncable(ref);
    this.syncableSnapshotMap.delete(ref.id);
  }

  private onUpdateChange(ref: SyncableRef, diffs: deepDiff.IDiff[]): void {
    let snapshot = this.syncableSnapshotMap.get(ref.id)!;

    for (let diff of diffs) {
      DeepDiff.applyChange(snapshot, undefined!, diff);
    }

    this.manager.updateSyncable(snapshot);
  }

  private shiftChangePacket(id: ChangePacketId): boolean {
    let packets = this.pendingChangePackets;

    let index = packets.findIndex(packet => packet.id === id);

    if (index < 0) {
      return false;
    }

    if (index === 0) {
      packets.shift();
      return true;
    }

    throw new Error(
      `Change packet UID "${id}" does not match the first pending packet`,
    );
  }

  private applyChangePacket(packet: ChangePacket): void {
    let manager = this.manager;

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

    let {
      updates: updateDict,
      creations,
      removals,
      notificationPacket,
    } = this.changePlant.process(
      packet,
      syncableObjectOrCreationRefDict,
      this.context,
    );

    for (let {snapshot} of Object.values(updateDict)) {
      manager.updateSyncable(snapshot);
    }

    for (let ref of removals) {
      manager.removeSyncable(ref);
    }

    for (let syncable of creations) {
      manager.addSyncable(syncable);
    }

    if (notificationPacket) {
      this.emit('notify', notificationPacket);
    }
  }

  private pushChangePacket(packet: ChangePacket): void {
    this.pendingChangePackets.push(packet);

    this.socket.emit('syncable:change', packet);
  }
}

export interface Client<
  TGenericParams extends ClientGenericParams = ClientGenericParams
> {
  on(
    event: 'notify',
    listener: (
      packet: NotificationPacket<TGenericParams['notification']>,
    ) => void,
  ): this;

  emit(
    event: 'notify',
    packet: NotificationPacket<TGenericParams['notification']>,
  ): boolean;
}
