import {
  ChangePacket,
  ChangePacketId,
  ChangePlant,
  ChangePlantBlueprint,
  ClientRPCDefinition,
  GeneralChange,
  IChangePlantBlueprintGenericParams,
  IRPCDefinition,
  ISyncable,
  ISyncableAdapter,
  ISyncableObject,
  NumericTimestamp,
  RPCFunctionDict,
  RPCPeer,
  ServerConnectionRPCDefinition,
  SyncableContainer,
  SyncableId,
  SyncableRef,
  SyncingData,
  SyncingUpdateSource,
  generateUniqueId,
} from '@syncable/core';
import DeepDiff, {Diff} from 'deep-diff';
import _ from 'lodash';
import {action, observable, when} from 'mobx';

import {IClientAdapter} from './client-adapter';

const clientRPCFunctionDict: RPCFunctionDict<
  Client<IClientGenericParams>,
  ClientRPCDefinition
> = {
  initialize(data, contextData) {
    this.initialize(data, contextData);
  },
  sync(data, source) {
    this.sync(data, source);
  },
};

export interface ClientUpdateResult {
  id: ChangePacketId;
  promise: Promise<void>;
}

export interface IClientGenericParams
  extends IChangePlantBlueprintGenericParams {
  syncableObject: ISyncableObject;
  customRPCDefinition: IRPCDefinition;
}

export class Client<
  TGenericParams extends IClientGenericParams
> extends RPCPeer<ClientRPCDefinition, ServerConnectionRPCDefinition> {
  readonly container: SyncableContainer;

  @observable
  private _syncing = false;

  @observable
  private pendingChangePackets: ChangePacket[] = [];

  private syncableSnapshotMap = new Map<SyncableId, ISyncable>();

  private changePlant: ChangePlant;

  constructor(
    readonly context: TGenericParams['context'],
    private clientAdapter: IClientAdapter<TGenericParams>,
    syncableAdapter: ISyncableAdapter<TGenericParams>,
    blueprint: ChangePlantBlueprint<TGenericParams>,
    customRPCFunctionDict: RPCFunctionDict<
      Client<TGenericParams>,
      TGenericParams['customRPCDefinition']
    >,
  ) {
    super(clientAdapter, {
      ...clientRPCFunctionDict,
      ...customRPCFunctionDict,
    });

    this.container = new SyncableContainer(syncableAdapter);

    this.changePlant = new ChangePlant(blueprint, syncableAdapter);
  }

  get syncing(): boolean {
    return this._syncing;
  }

  @action
  initialize(data: SyncingData, contextData: unknown): void {
    this.container.clear();
    this.context.setData(contextData);

    this.sync(data);
  }

  @action
  sync(
    {syncables, removals, updates}: SyncingData,
    source?: SyncingUpdateSource,
  ): void {
    if (source) {
      this.shiftChangePacket(source.id);
    }

    for (let syncable of syncables) {
      this.onUpdateCreate(syncable);
    }

    for (let {ref, diffs} of updates) {
      this.onUpdateChange(ref, diffs);
    }

    for (let ref of removals) {
      this.onUpdateRemove(ref);
    }

    let packets = this.pendingChangePackets;

    if (packets.length) {
      for (let packet of packets) {
        this.applyChangePacket(packet);
      }
    } else {
      this._syncing = false;
    }
  }

  @action
  update(change: TGenericParams['change']): ClientUpdateResult {
    change = _.cloneDeep(change);

    let id = generateUniqueId<ChangePacketId>();

    let packet: ChangePacket = {
      id,
      createdAt: Date.now() as NumericTimestamp,
      ...(change as GeneralChange),
    };

    this.applyChangePacket(packet);

    this.pendingChangePackets.push(packet);

    this._syncing = true;

    let promise = this.call('change', packet);

    return {id, promise};
  }

  async updateAndConfirm(change: TGenericParams['change']): Promise<void> {
    let {id, promise} = this.update(change);

    await promise;

    return when(
      () => !this.pendingChangePackets.some(packet => packet.id === id),
    );
  }

  private onUpdateCreate(syncable: ISyncable): void {
    this.container.addSyncable(syncable);

    let snapshot = _.cloneDeep(syncable);

    this.syncableSnapshotMap.set(syncable._id, snapshot);
  }

  private onUpdateRemove(ref: SyncableRef): void {
    this.container.removeSyncable(ref, true);
    this.syncableSnapshotMap.delete(ref.id);
  }

  private onUpdateChange(ref: SyncableRef, diffs: Diff<ISyncable>[]): void {
    let snapshot = this.syncableSnapshotMap.get(ref.id)!;

    for (let diff of diffs) {
      DeepDiff.applyChange(snapshot, undefined!, diff);
    }

    this.container.updateSyncable(snapshot);
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
    let container = this.container;

    let {
      updates,
      creations,
      removals,
      notifications,
    } = this.changePlant.process(packet, this.context, container);

    for (let syncable of creations) {
      container.addSyncable(syncable);
    }

    for (let {snapshot} of updates) {
      container.updateSyncable(snapshot);
    }

    for (let ref of removals) {
      container.removeSyncable(ref);
    }

    this.clientAdapter.handleNotifications(notifications, packet.id);
  }
}
