import {
  ChangePacket,
  ChangePlantProcessingResultWithTimestamp,
  ChangeSource,
  Context,
  GeneralSyncableRef,
  InitialData,
  SnapshotData,
  Syncable,
  SyncableId,
  SyncableManager,
  SyncableRef,
  SyncingData,
  SyncingDataUpdateEntry,
  UserSyncableObject,
  getSyncableRef,
} from '@syncable/core';
import _ from 'lodash';
import {observable} from 'mobx';

import {GroupClock, Server, ViewQueryFilter} from './server';

export interface ConnectionSocket extends SocketIO.Socket {
  on(event: 'view-query', listener: (query: unknown) => void): this;
  on(event: 'change', listener: (packet: ChangePacket) => void): this;

  emit(event: 'initialize', data: InitialData): boolean;
  emit(event: 'sync', data: SyncingData): boolean;
}

export class Connection {
  private context!: Context;
  private snapshotIdSet = new Set<SyncableId>();

  constructor(
    readonly group: string,
    private socket: ConnectionSocket,
    private server: Server,
    private clock: GroupClock,
    private manager: SyncableManager,
  ) {}

  async initialize(
    userRef: SyncableRef<UserSyncableObject>,
    viewQuery: unknown,
  ): Promise<void> {
    let socket = this.socket;
    let manager = this.manager;

    socket
      .on('change', packet => {
        this.getTimestampAndUpdate(packet).catch(this.error);
      })
      .on('view-query', query => {
        this.updateViewQuery(query);
      });

    let user = manager.requireSyncableObject(userRef);

    this.context = new Context(user);

    this.updateViewQuery(viewQuery, false);

    let snapshotData = this.snapshot(userRef);

    socket.emit('initialize', {userRef, ...snapshotData});
  }

  // TODO: ability limit iteration within a subset of syncables to improve
  // performance.
  snapshot(userRef?: SyncableRef<UserSyncableObject>): SnapshotData {
    let manager = this.manager;
    let context = this.context;

    let filter = this.filter;
    let snapshotIdSet = this.snapshotIdSet;

    let ensuredSyncableSet = new Set<Syncable>();

    let snapshotSyncables: Syncable[] = [];
    let snapshotRemovals: SyncableRef[] = [];

    if (userRef) {
      let userSyncable = manager.requireSyncable(userRef);
      ensureAssociationsAndDoSnapshot(userSyncable, true);
    }

    for (let syncable of manager.getSyncables()) {
      ensureAssociationsAndDoSnapshot(syncable, false);
    }

    return {
      syncables: snapshotSyncables,
      removals: snapshotRemovals,
    };

    function ensureAssociationsAndDoSnapshot(
      syncable: Syncable,
      requisite: boolean,
    ): void {
      if (ensuredSyncableSet.has(syncable)) {
        return;
      }

      ensuredSyncableSet.add(syncable);

      let {_id: id, _associations: associations} = syncable;

      let ref = getSyncableRef(syncable);
      let object = manager.requireSyncableObject(ref);

      let visible = object.testAccessRights(['read'], context, {});

      if (!visible) {
        if (snapshotIdSet.has(id)) {
          snapshotIdSet.delete(id);
          snapshotRemovals.push(ref);
        }

        return;
      }

      if (snapshotIdSet.has(id)) {
        return;
      }

      if (!requisite && filter && !filter(object)) {
        return;
      }

      if (associations) {
        for (let {requisite = false, ref} of associations) {
          let syncable = manager.requireSyncable(ref);
          ensureAssociationsAndDoSnapshot(syncable, requisite);
        }
      }

      snapshotIdSet.add(id);
      snapshotSyncables.push(syncable);
    }
  }

  handleChangeResult({
    uid,
    timestamp,
    updates: updateDict,
  }: ChangePlantProcessingResultWithTimestamp): void {
    let socket = this.socket;

    let snapshotData = this.snapshot();

    let updates: SyncingDataUpdateEntry[] = [];

    let snapshotIdSet = this.snapshotIdSet;

    for (let {snapshot, diffs} of Object.values(updateDict)) {
      let ref = getSyncableRef(snapshot);
      let {id} = ref;

      if (snapshotIdSet.has(id)) {
        updates.push({
          ref,
          diffs,
        });
      }
    }

    let source: ChangeSource = {uid, timestamp};

    socket.emit('sync', {source, updates, ...snapshotData});
  }

  @observable private filter: ViewQueryFilter = () => false;

  private error = (error: Error): void => {
    console.error(error);
    this.socket.disconnect();
  };

  private async getTimestampAndUpdate(packet: ChangePacket): Promise<void> {
    let timestamp = await this.clock.next();

    await this.update(packet, timestamp);
  }

  private async update(packet: ChangePacket, timestamp: number): Promise<void> {
    let result = this.applyChangePacket(packet, timestamp);

    this.server.saveAndBroadcastChangeResult(this.group, result);
  }

  private updateViewQuery(query: unknown, snapshot = true): void {
    this.filter = this.server.getViewQueryFilter(query);

    if (snapshot) {
      let snapshotData = this.snapshot();
      this.socket.emit('sync', {...snapshotData});
    }
  }

  private applyChangePacket(
    packet: ChangePacket,
    timestamp: number,
  ): ChangePlantProcessingResultWithTimestamp {
    let manager = this.manager;

    let refDict = packet.refs;

    let syncableObjectOrCreationRefDict = _.mapValues(
      refDict,
      (ref: GeneralSyncableRef) =>
        'creation' in ref && ref.creation
          ? ref
          : manager.requireSyncableObject(ref),
    );

    let result = this.server.changePlant.process(
      packet,
      syncableObjectOrCreationRefDict,
      this.context,
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

    return result;
  }
}
