import {
  BuiltInChange,
  Change,
  ChangePacket,
  ChangePacketUID,
  ChangePlant,
  Context,
  GeneralChange,
  InitialData,
  SnapshotData,
  Syncable,
  SyncableId,
  SyncableManager,
  SyncableObject,
  SyncableObjectFactory,
  SyncableRef,
  SyncingData,
  UserSyncableObject,
} from '@syncable/core';
import * as DeepDiff from 'deep-diff';
import _ from 'lodash';
import uuid from 'uuid';

import {ClientSocket, createClientSocket} from './@client-socket';

export interface ClientAssociateOptions {
  name?: string;
  requisite?: boolean;
  secures?: boolean;
}

export class Client<
  TUser extends UserSyncableObject,
  TSyncableObject extends SyncableObject,
  TChange extends Change
> {
  readonly context: Context<TUser>;
  readonly ready: Promise<void>;

  private manager: SyncableManager;
  private socket: ClientSocket<TUser>;

  private pendingChangePackets: ChangePacket[] = [];
  private syncableSnapshotMap = new Map<SyncableId, Syncable>();

  constructor(
    uri: string,
    factory: SyncableObjectFactory,
    changePlant: ChangePlant<TChange>,
  );
  constructor(
    uri: string,
    factory: SyncableObjectFactory,
    private changePlant: ChangePlant<GeneralChange>,
  ) {
    this.context = new Context();
    this.manager = new SyncableManager(factory);

    let socket = (this.socket = createClientSocket<TUser>(uri));

    this.ready = new Promise<void>(resolve => {
      socket.on('initialize', data => {
        console.log('initialize', data);
        this.onInitialize(data);
        resolve();
      });
    });

    socket.on('sync', data => {
      // console.log('sync', data);
      this.onSync(data);
    });
  }

  get user(): TUser {
    return this.context.user;
  }

  get objects(): TSyncableObject[] {
    return this.manager.syncableObjects as TSyncableObject[];
  }

  associate(
    target: TSyncableObject,
    source: TSyncableObject,
    options?: ClientAssociateOptions,
  ): void;
  associate(
    {ref: target}: TSyncableObject,
    {ref: source}: TSyncableObject,
    {name, secures = false, requisite = secures}: ClientAssociateOptions = {},
  ): void {
    this.update({
      type: '$associate',
      refs: {target, source},
      options: {name, requisite, secures},
    });
  }

  unassociate(target: TSyncableObject, source: TSyncableObject): void;
  unassociate(
    {ref: target}: TSyncableObject,
    {ref: source}: TSyncableObject,
  ): void {
    this.update({
      type: '$unassociate',
      refs: {target, source},
      options: {},
    });
  }

  update(change: TChange | BuiltInChange): void {
    let packet: ChangePacket = {
      uid: uuid() as ChangePacketUID,
      ...(change as GeneralChange),
    };

    this.applyChangePacket(packet);
    this.pushChangePacket(packet);
  }

  private onConnection(): void {}

  private onInitialize({userRef, ...data}: InitialData<TUser>): void {
    this.onSnapshotData(data);

    let user = this.manager.requireSyncableObject(userRef);
    this.context.initialize(user);
  }

  private onSync(data: SyncingData): void {
    this.onSnapshotData(data);

    if ('ack' in data) {
      for (let {ref, diffs} of data.updates) {
        this.onUpdateChange(ref, diffs);
      }

      this.shiftChangePacket(data.ack.uid);

      for (let packet of this.pendingChangePackets) {
        this.applyChangePacket(packet);
      }
    }
  }

  private onSnapshotData({syncables, removals}: SnapshotData): void {
    for (let syncable of syncables) {
      this.onUpdateCreate(syncable);
    }

    for (let ref of removals) {
      this.onUpdateRemove(ref);
    }
  }

  private onUpdateCreate(syncable: Syncable): void {
    this.manager.addSyncable(syncable);

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

  private shiftChangePacket(uid: ChangePacketUID): void {
    let packets = this.pendingChangePackets;

    let index = packets.findIndex(packet => packet.uid === uid);

    if (index < 0) {
      return;
    }

    if (index === 0) {
      packets.shift();
      return;
    }

    throw new Error(
      `Change packet UID "${uid}" does not match the first pending packet`,
    );
  }

  private applyChangePacket(packet: ChangePacket): void {
    let manager = this.manager;

    let refDict = packet.refs;

    let syncableObjectDict = _.mapValues(refDict, ref =>
      manager.requireSyncableObject(ref),
    );

    let {updates: updateDict, creations, removals} = this.changePlant.process(
      packet,
      syncableObjectDict,
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
  }

  private pushChangePacket(packet: ChangePacket): void {
    this.pendingChangePackets.push(packet);

    this.socket.emit('change', packet);
  }
}
