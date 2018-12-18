import {EventEmitter} from 'events';

import {
  ChangePacket,
  ChangePacketId,
  ChangePlant,
  ChangePlantBlueprint,
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
  SnapshotData,
  SyncableId,
  SyncableManager,
  SyncableRef,
  SyncingData,
  getSyncableKey,
} from '@syncable/core';
import * as DeepDiff from 'deep-diff';
import _ from 'lodash';
import {action, observable} from 'mobx';
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
  viewQuery: unknown;
  notification: INotification;
}

export class Client<
  TGenericParams extends ClientGenericParams = ClientGenericParams
> extends EventEmitter {
  readonly context: Context<TGenericParams['user']>;
  readonly ready: Promise<void>;

  private initialized = false;
  private viewQuery: TGenericParams['viewQuery'] | undefined;

  @observable
  private _syncing = false;

  private manager: SyncableManager;
  private socket: ClientSocket;

  private pendingChangePackets: ChangePacket[] = [];
  private syncableSnapshotMap = new Map<SyncableId, ISyncable>();

  private requestHandlerMap = new Map<string, () => void>();

  private changePlant: ChangePlant;

  constructor(
    socket: SocketIOClient.Socket,
    provider: ISyncableObjectProvider,
    blueprint: ChangePlantBlueprint<TGenericParams>,
  ) {
    super();

    this.context = new Context('user', 'client');
    this.manager = new SyncableManager(provider);
    this.changePlant = new ChangePlant(blueprint, provider);

    this.socket = socket as ClientSocket;

    this.ready = new Promise<void>(resolve => {
      this.socket.on('syncable:initialize', data => {
        this.manager.clear();
        this.onInitialize(data);
        resolve();
      });
    });

    this.socket
      .on('syncable:sync', data => {
        this.onSync(data);
      })
      .on('syncable:complete-requests', refs => {
        this.onCompleteRequests(refs);
      });
  }

  get syncing(): boolean {
    return this._syncing;
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

  async requestObject<TRef extends TGenericParams['syncableObject']['ref']>(
    ref: TRef,
  ): Promise<
    Extract<TGenericParams['syncableObject'], {ref: TRef}> | undefined
  > {
    let manager = this.manager;

    let object = manager.getSyncableObject<
      Extract<TGenericParams['syncableObject'], {ref: TRef}>
    >(ref);

    if (object) {
      return object;
    } else {
      this.socket.emit('syncable:request', ref);

      await new Promise<void>(resolve => {
        let key = getSyncableKey(ref);
        this.requestHandlerMap.set(key, resolve);
      });

      return manager.getSyncableObject<
        Extract<TGenericParams['syncableObject'], {ref: TRef}>
      >(ref);
    }
  }

  @action
  update(change: TGenericParams['change']): void {
    change = _.cloneDeep(change);

    let packet: ChangePacket = {
      id: uuid() as ChangePacketId,
      createdAt: Date.now(),
      ...(change as GeneralChange),
    };

    this.applyChangePacket(packet);
    this.pushChangePacket(packet);

    this._syncing = true;
  }

  query(viewQuery: TGenericParams['viewQuery']): void {
    this.viewQuery = viewQuery;

    if (this.initialized) {
      this.socket.emit('syncable:view-query', viewQuery);
    }
  }

  private onInitialize({
    userRef,
    ...data
  }: InitialData<TGenericParams['user']>): void {
    this.onSnapshotData(data, false);

    let user = this.manager.requireSyncableObject(userRef);
    this.context.initialize(user);

    this.initialized = true;

    let viewQuery = this.viewQuery;

    if (viewQuery) {
      this.socket.emit('syncable:view-query', viewQuery);
    }
  }

  @action
  private onSync(data: SyncingData): void {
    if ('source' in data) {
      let matched = this.shiftChangePacket(data.source.id);

      this.onSnapshotData(data, matched);

      for (let {ref, diffs} of data.updates) {
        this.onUpdateChange(ref, diffs);
      }

      let packets = this.pendingChangePackets;

      if (packets.length) {
        for (let packet of packets) {
          this.applyChangePacket(packet);
        }
      } else {
        this._syncing = false;
      }
    } else {
      this.onSnapshotData(data, false);
    }
  }

  private onCompleteRequests(refs: SyncableRef[]): void {
    let map = this.requestHandlerMap;

    for (let ref of refs) {
      let key = getSyncableKey(ref);
      let resolve = map.get(key)!;

      resolve();

      map.delete(key);
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
    this.manager.removeSyncable(ref, true);
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

    let {id, refs: refDict} = packet;

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
      updates,
      creations,
      removals,
      notifications,
    } = this.changePlant.process(
      packet,
      syncableObjectOrCreationRefDict,
      this.context,
      manager,
    );

    for (let {snapshot} of updates) {
      manager.updateSyncable(snapshot);
    }

    for (let ref of removals) {
      manager.removeSyncable(ref);
    }

    for (let syncable of creations) {
      manager.addSyncable(syncable);
    }

    for (let notification of notifications) {
      this.emit('notify', notification, id);
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
      notification: TGenericParams['notification'],
      id: ChangePacketId,
    ) => void,
  ): this;

  emit(
    event: 'notify',
    notification: TGenericParams['notification'],
    id: ChangePacketId,
  ): boolean;
}
