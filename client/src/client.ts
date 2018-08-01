import {
  Change,
  ChangePacket,
  ChangePacketUID,
  ChangePlant,
  Consequence,
  GeneralChange,
  Syncable,
  SyncableId,
  SyncableObject,
  SyncableRef,
  UserSyncableObject,
} from '@syncable/core';
import _ = require('lodash');
import uuid = require('uuid');

import {ClientContext} from './client-context';
import {ClientSocket, createClientSocket} from './client-socket';

export interface SnapshotsData {
  snapshots: Syncable[];
}

export class Client<TUser extends UserSyncableObject, TChange extends Change> {
  private socket: ClientSocket<TUser>;

  private pendingChangePackets: ChangePacket[] = [];
  private syncableSnapshotMap = new Map<SyncableId, Syncable>();

  constructor(context: ClientContext<TUser>, changePlant: ChangePlant<TChange>);
  constructor(
    private context: ClientContext,
    private changePlant: ChangePlant<GeneralChange>,
  ) {
    this.socket = createClientSocket<TUser>()
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
  ): void {
    this.addChange({
      type: '$associate',
      refs: {target, source},
      options: {requisite: true},
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

  private onConnection(): void {}

  private onSnapshot(
    syncables: Syncable[],
    userRef?: SyncableRef<TUser>,
  ): void {
    for (let syncable of syncables) {
      this.context.addSyncable(syncable);
    }

    if (userRef) {
      this.context.initialize(userRef);
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
    this.context.addSyncable(syncable);

    let snapshot = _.cloneDeep(syncable);

    this.syncableSnapshotMap.set(syncable.$id, snapshot);
  }

  private onConsequentRemoval(ref: SyncableRef): void {
    this.context.removeSyncable(ref);
    this.syncableSnapshotMap.delete(ref.id);
  }

  private onConsequentUpdate(ref: SyncableRef, diffs: deepDiff.IDiff[]): void {
    let snapshot = this.syncableSnapshotMap.get(ref.id)!;

    for (let diff of diffs) {
      DeepDiff.applyChange(snapshot, undefined!, diff);
    }

    this.context.updateSyncable(snapshot);
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

  private addChange(change: GeneralChange): void {
    let packet: ChangePacket = {
      uid: uuid() as ChangePacketUID,
      ...change,
    };

    this.applyChangePacket(packet);

    this.pushChangePacket(packet);
  }

  private applyChangePacket(packet: ChangePacket): void {
    let context = this.context;

    let refDict = packet.refs;

    let syncableDict = _.mapValues(refDict, ref =>
      context.requireSyncable(ref),
    );

    let {updates: updateDict, creations, removals} = this.changePlant.process(
      packet,
      syncableDict,
    );

    let updateEntries = Object.entries(updateDict);

    for (let [name, {requisiteAccessRights}] of updateEntries) {
      let ref = refDict[name];
      let object = context.require(ref);

      object.validateAccessRights(requisiteAccessRights);
    }

    for (let ref of removals) {
      let object = context.require(ref);

      object.validateAccessRights(['delete']);
    }

    for (let [name, {diffs}] of updateEntries) {
      let syncable = syncableDict[name];

      for (let diff of diffs) {
        DeepDiff.applyChange(syncable, undefined!, diff);
      }
    }

    for (let ref of removals) {
      context.removeSyncable(ref);
    }

    for (let syncable of creations) {
      context.addSyncable(syncable);
    }
  }

  private pushChangePacket(packet: ChangePacket): void {
    this.pendingChangePackets.push(packet);

    this.socket.emit('change', packet);
  }
}
