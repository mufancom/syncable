import {
  AccessControlChange,
  Change,
  ChangePacket,
  ChangePacketUID,
  ChangePlant,
  Consequence,
  Context,
  GeneralChange,
  Syncable,
  SyncableId,
  SyncableManager,
  SyncableObject,
  SyncableObjectFactory,
  SyncableRef,
  UserSyncableObject,
} from '@syncable/core';
import * as DeepDiff from 'deep-diff';
import _ = require('lodash');
import uuid = require('uuid');

import {ClientSocket, createClientSocket} from './@client-socket';

export interface SnapshotsData {
  snapshots: Syncable[];
}

export interface ClientAssociateOptions {
  requisite?: boolean;
  secures?: boolean;
}

export class Client<TUser extends UserSyncableObject, TChange extends Change> {
  context: Context<TUser>;

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
    this.manager = new SyncableManager(factory, this.context);

    this.socket = createClientSocket<TUser>(uri)
      .on('snapshot', ({syncables, userRef}) => {
        this.onSnapshot(syncables, userRef);
      })
      .on('consequent-series', ({uid, consequences}) => {
        this.onConsequences(uid, consequences);
      });
  }

  associate(
    {ref: target}: SyncableObject,
    {ref: source}: SyncableObject,
    {secures = false, requisite = secures}: ClientAssociateOptions,
  ): void {
    this.addChange({
      type: '$associate',
      refs: {target, source},
      options: {requisite, secures},
    });
  }

  unassociate(
    {ref: target}: SyncableObject,
    {ref: source}: SyncableObject,
  ): void {
    this.addChange({
      type: '$unassociate',
      refs: {target, source},
      options: {requisite: true},
    });
  }

  addChange(change: TChange | AccessControlChange): void {
    let packet: ChangePacket = {
      uid: uuid() as ChangePacketUID,
      ...(change as GeneralChange),
    };

    this.applyChangePacket(packet);

    this.pushChangePacket(packet);
  }

  private onConnection(): void {}

  private onSnapshot(
    syncables: Syncable[],
    userRef?: SyncableRef<TUser>,
  ): void {
    for (let syncable of syncables) {
      this.manager.addSyncable(syncable);
    }

    if (userRef) {
      let user = this.manager.requireSyncableObject(userRef);
      this.context.initialize(user);
    }
  }

  private onConsequences(
    uid: ChangePacketUID,
    consequences: Consequence[],
  ): void {
    this.shiftChangePacket(uid);

    for (let consequence of consequences) {
      switch (consequence.type) {
        case 'creation':
          this.onConsequentCreation(consequence.syncable);
          break;
        case 'removal':
          this.onConsequentRemoval(consequence.ref);
          break;
        case 'update':
          this.onConsequentUpdate(consequence.ref, consequence.diffs);
          break;
      }
    }

    for (let packet of this.pendingChangePackets) {
      this.applyChangePacket(packet);
    }
  }

  private onConsequentCreation(syncable: Syncable): void {
    this.manager.addSyncable(syncable);

    let snapshot = _.cloneDeep(syncable);

    this.syncableSnapshotMap.set(syncable._id, snapshot);
  }

  private onConsequentRemoval(ref: SyncableRef): void {
    this.manager.removeSyncable(ref);
    this.syncableSnapshotMap.delete(ref.id);
  }

  private onConsequentUpdate(ref: SyncableRef, diffs: deepDiff.IDiff[]): void {
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
