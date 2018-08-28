import {
  ChangePacket,
  ChangePlantProcessingResultWithTimestamp,
  Context,
  InitialData,
  SnapshotData,
  Syncable,
  SyncableId,
  SyncableManager,
  SyncableRef,
  SyncingData,
  SyncingDataUpdateEntry,
  UpdateSource,
  UserSyncableObject,
  getSyncableRef,
} from '@syncable/core';
import _ from 'lodash';
import {observable} from 'mobx';

import {Server, ViewQueryFilter} from './server';

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
        this.update(packet);
      })
      .on('view-query', query => {
        this.updateViewQuery(query);
      });

    let user = manager.requireSyncableObject(userRef);

    this.context = new Context('user', user);

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

    let source: UpdateSource = {uid, timestamp};

    socket.emit('sync', {source, updates, ...snapshotData});
  }

  @observable private filter: ViewQueryFilter = () => false;

  private update(packet: ChangePacket): void {
    this.server.applyChangePacket(this.group, packet, this.context);
  }

  private updateViewQuery(query: unknown, snapshot = true): void {
    this.filter = this.server.getViewQueryFilter(query);

    if (snapshot) {
      let snapshotData = this.snapshot();
      this.socket.emit('sync', {...snapshotData});
    }
  }
}
