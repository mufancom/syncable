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
  IRPCDefinition,
  ISyncable,
  ISyncableObject,
  ISyncableObjectProvider,
  IUserSyncableObject,
  InitialData,
  RPCCallError,
  RPCCallId,
  RPCCallResult,
  SnapshotData,
  SyncableId,
  SyncableManager,
  SyncableRef,
  SyncingData,
  getSyncableKey,
} from '@syncable/core';
import * as DeepDiff from 'deep-diff';
import _ from 'lodash';
import {action, observable, runInAction, when} from 'mobx';
import uuid from 'uuid';
import * as v from 'villa';

import {ClientSocket} from './@client-socket';

interface RPCCallHandlers {
  resolve(data: unknown): void;
  reject(error: RPCCallError): void;
}

type RPCCallFunction<TRPCDefinition extends IRPCDefinition> = (
  params: TRPCDefinition['params'],
) => Promise<TRPCDefinition['return']>;

type RPCCallObject<TRPCDefinition extends IRPCDefinition = IRPCDefinition> = {
  [K in TRPCDefinition['name']]: RPCCallFunction<
    Extract<TRPCDefinition, {name: K}>
  >
};

export interface ClientAssociateOptions {
  name?: string;
  secures?: boolean;
}

export interface ClientGenericParams {
  user: IUserSyncableObject;
  syncableObject: ISyncableObject;
  change: IChange;
  viewQuery: unknown;
  rpcDefinition: IRPCDefinition;
  notification: INotification;
}

export class Client<
  TGenericParams extends ClientGenericParams = ClientGenericParams
> extends EventEmitter {
  readonly context: Context<TGenericParams['user']>;
  readonly ready: Promise<void>;
  readonly rpc: RPCCallObject<TGenericParams['rpcDefinition']>;

  private initialized = false;
  private viewQuery: TGenericParams['viewQuery'] | undefined;

  @observable
  private _syncing = false;

  private manager: SyncableManager;
  private socket: ClientSocket;

  @observable
  private pendingChangePackets: ChangePacket[] = [];

  private syncableSnapshotMap = new Map<SyncableId, ISyncable>();

  private requestHandlerMap = new Map<string, () => void>();
  private callHandlersMap = new Map<RPCCallId, RPCCallHandlers>();

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
        runInAction(() => {
          this.manager.clear();
          this.onInitialize(data);
        });
        resolve();
      });
    });

    this.socket
      .on('syncable:sync', data => this.onSync(data))
      .on('syncable:complete-requests', refs => this.onCompleteRequests(refs))
      .on('syncable:complete-call', data => this.onCompleteCall(data));

    this.rpc = this.createRPCCallObject();
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

  async requestObjects<TRef extends TGenericParams['syncableObject']['ref']>(
    refs: TRef[],
  ): Promise<
    (Extract<TGenericParams['syncableObject'], {ref: TRef}> | undefined)[]
  > {
    return v.map(refs, ref => this.requestObject(ref));
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
  update(change: TGenericParams['change']): ChangePacketId {
    change = _.cloneDeep(change);

    let id = uuid() as ChangePacketId;

    let packet: ChangePacket = {
      id,
      createdAt: Date.now(),
      ...(change as GeneralChange),
    };

    this.applyChangePacket(packet);
    this.pushChangePacket(packet);

    this._syncing = true;

    return id;
  }

  updateAndConfirm(change: TGenericParams['change']): Promise<void> {
    let id = this.update(change);

    return when(
      () => !this.pendingChangePackets.some(packet => packet.id === id),
    );
  }

  query(viewQuery: TGenericParams['viewQuery']): void {
    this.viewQuery = viewQuery;

    if (this.initialized) {
      this.socket.emit('syncable:view-query', viewQuery);
    }
  }

  @action
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

  private createRPCCallObject(): RPCCallObject<
    TGenericParams['rpcDefinition']
  > {
    let map = new Map<string, (params: object) => unknown>();

    return new Proxy(
      {},
      {
        get: (target, name) => {
          if (typeof name !== 'string') {
            return (target as any)[name];
          }

          let fn = map.get(name);

          if (fn) {
            return fn;
          }

          fn = params => {
            let id = uuid() as RPCCallId;

            this.socket.emit('syncable:call', {
              id,
              name,
              params,
            });

            return new Promise<any>((resolve, reject) => {
              this.callHandlersMap.set(id, {resolve, reject});
            });
          };

          map.set(name, fn);

          return fn;
        },
      },
    ) as RPCCallObject<TGenericParams['rpcDefinition']>;
  }

  private onCompleteCall({id, data, error}: RPCCallResult): void {
    let handlers = this.callHandlersMap.get(id);

    if (handlers) {
      this.callHandlersMap.delete(id);

      let {resolve, reject} = handlers;

      if (error) {
        reject(error);
      } else {
        resolve(data);
      }
    }
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
