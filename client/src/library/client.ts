import {
  ChangePacket,
  ChangePacketId,
  ChangePlant,
  ChangePlantBlueprint,
  ClientRPCDefinition,
  ConnectionRPCDefinition,
  GeneralChange,
  IChangePlantBlueprintGenericParams,
  IRPCDefinition,
  ISyncable,
  ISyncableAdapter,
  ISyncableObject,
  NumericTimestamp,
  RPCMethod,
  RPCPeer,
  RPCPeerType,
  SyncData,
  SyncUpdateSource,
  SyncableContainer,
  SyncableId,
  SyncableRef,
  ViewQueryUpdateObject,
  generateUniqueId,
} from '@syncable/core';
import DeepDiff, {Diff} from 'deep-diff';
import _ from 'lodash';
import {action, observable, when} from 'mobx';
import {Subject} from 'rxjs';

import {IClientAdapter} from './client-adapter';

export interface ClientUpdateResult {
  id: ChangePacketId;
  promise: Promise<void>;
}

export interface IClientGenericParams
  extends IChangePlantBlueprintGenericParams {
  syncableObject: ISyncableObject;
  viewQueryDict: object;
  customRPCDefinition: IRPCDefinition;
}

export class Client<TGenericParams extends IClientGenericParams>
  extends RPCPeer<ConnectionRPCDefinition>
  implements RPCPeerType<ClientRPCDefinition> {
  readonly container: SyncableContainer;

  @observable
  private _syncing = false;

  @observable
  private pendingChangePackets: ChangePacket[] = [];

  private syncableSnapshotMap = new Map<SyncableId, ISyncable>();

  private changePlant: ChangePlant;

  private initializeSubject$ = new Subject<void>();

  readonly ready = this.initializeSubject$.toPromise();

  constructor(
    readonly context: TGenericParams['context'],
    private clientAdapter: IClientAdapter<TGenericParams>,
    syncableAdapter: ISyncableAdapter<TGenericParams>,
    blueprint: ChangePlantBlueprint<TGenericParams>,
  ) {
    super(clientAdapter);

    this.container = new SyncableContainer(syncableAdapter);

    this.changePlant = new ChangePlant(blueprint);
  }

  get syncing(): boolean {
    return this._syncing;
  }

  getObjects(): TGenericParams['syncableObject'][];
  getObjects<
    TType extends TGenericParams['syncableObject']['syncable']['_type']
  >(
    type: TType,
  ): Extract<TGenericParams['syncableObject'], {syncable: {_type: TType}}>[];
  getObjects(type?: string): TGenericParams['syncableObject'][] {
    return this.container.getSyncableObjects(
      type,
    ) as TGenericParams['syncableObject'][];
  }

  getObject<TRef extends TGenericParams['syncableObject']['ref']>(
    ref: TRef,
  ): Extract<TGenericParams['syncableObject'], {ref: TRef}> | undefined {
    return this.container.getSyncableObject(ref as SyncableRef) as
      | Extract<TGenericParams['syncableObject'], {ref: TRef}>
      | undefined;
  }

  requireObject<TRef extends TGenericParams['syncableObject']['ref']>(
    ref: TRef,
  ): Extract<TGenericParams['syncableObject'], {ref: TRef}> {
    return this.container.requireSyncableObject(ref as SyncableRef) as Extract<
      TGenericParams['syncableObject'],
      {ref: TRef}
    >;
  }

  async requestObjects<TRef extends TGenericParams['syncableObject']['ref']>(
    refs: TRef[],
  ): Promise<
    (Extract<TGenericParams['syncableObject'], {ref: TRef}> | undefined)[]
  > {
    await this.call('request-syncables', refs);

    let container = this.container;

    return refs
      .map(ref => container.getSyncableObject(ref))
      .filter(
        (
          object,
        ): object is Extract<TGenericParams['syncableObject'], {ref: TRef}> =>
          !!object,
      );
  }

  async requestObject<TRef extends TGenericParams['syncableObject']['ref']>(
    ref: TRef,
  ): Promise<
    Extract<TGenericParams['syncableObject'], {ref: TRef}> | undefined
  > {
    let [object] = await this.requestObjects([ref]);
    return object;
  }

  async query(
    update: ViewQueryUpdateObject<TGenericParams['viewQueryDict']>,
  ): Promise<void> {
    await this.call('update-view-query', update);
  }

  @action
  applyChange(change: TGenericParams['change']): ClientUpdateResult {
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

    let promise = this.call('apply-change', packet);

    return {id, promise};
  }

  async applyChangeAndConfirm(change: TGenericParams['change']): Promise<void> {
    let {id, promise} = this.applyChange(change);

    await promise;

    return when(
      () => !this.pendingChangePackets.some(packet => packet.id === id),
    );
  }

  @RPCMethod()
  @action
  initialize(data: SyncData, contextRef: SyncableRef): void {
    this.container.clear();

    this.sync(data);

    this.context.setObject(this.requireObject(contextRef));

    this.initializeSubject$.complete();
  }

  @RPCMethod()
  @action
  sync(
    {syncables, removals, updates}: SyncData,
    source?: SyncUpdateSource,
  ): void {
    let clock: number | undefined;

    if (source) {
      clock = source.clock;
      this.shiftChangePacket(source.id);
    }

    for (let syncable of syncables) {
      this.onUpdateCreate(syncable, clock);
    }

    for (let {ref, diffs} of updates) {
      this.onUpdateChange(ref, diffs, clock);
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

  private onUpdateCreate(syncable: ISyncable, clock: number | undefined): void {
    this.container.addSyncable(syncable, clock);

    let snapshot = _.cloneDeep(syncable);

    this.syncableSnapshotMap.set(syncable._id, snapshot);
  }

  private onUpdateRemove(ref: SyncableRef): void {
    this.container.removeSyncable(ref);
    this.syncableSnapshotMap.delete(ref.id);
  }

  private onUpdateChange(
    ref: SyncableRef,
    diffs: Diff<ISyncable>[],
    clock: number | undefined,
  ): void {
    let snapshot = this.syncableSnapshotMap.get(ref.id)!;

    for (let diff of diffs) {
      DeepDiff.applyChange(snapshot, undefined!, diff);
    }

    this.container.addSyncable(snapshot, clock);
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
      `Change packet ID "${id}" does not match the first pending packet`,
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
      container.addSyncable(snapshot);
    }

    for (let ref of removals) {
      container.removeSyncable(ref);
    }

    this.clientAdapter.handleNotifications(notifications, packet.id);
  }
}
