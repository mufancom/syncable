import {
  ChangePacket,
  ChangePlantProcessingResultWithTimestamp,
  Context,
  ISyncable,
  IUserSyncableObject,
  InitialData,
  SnapshotData,
  SyncableId,
  SyncableManager,
  SyncableRef,
  SyncingData,
  SyncingDataUpdateEntry,
  UpdateSource,
  getSyncableRef,
} from '@syncable/core';
import _ from 'lodash';
import {observable} from 'mobx';

import {IServer, ServerGenericParams, ViewQueryFilter} from './server';

export interface ConnectionSocket extends SocketIO.Socket {
  on(event: 'syncable:view-query', listener: (query: unknown) => void): this;
  on(event: 'syncable:change', listener: (packet: ChangePacket) => void): this;
  on(event: 'disconnect', listener: () => void): this;
  on(event: 'error', listener: (error: any) => void): this;

  emit(event: 'syncable:initialize', data: InitialData): boolean;
  emit(event: 'syncable:sync', data: SyncingData): boolean;
}

export class Connection<TServerGenericParams extends ServerGenericParams> {
  private context!: Context;
  private snapshotIdSet = new Set<SyncableId>();

  constructor(
    readonly group: string,
    private socket: ConnectionSocket,
    private server: IServer<TServerGenericParams>,
    private manager: SyncableManager,
  ) {}

  async initialize(
    userRef: SyncableRef<IUserSyncableObject>,
    viewQuery: unknown,
  ): Promise<void> {
    let socket = this.socket;
    let manager = this.manager;

    socket
      .on('syncable:change', packet => {
        this.update(packet);
      })
      .on('syncable:view-query', query => {
        this.updateViewQuery(query);
      });

    let user = manager.requireSyncableObject(userRef);

    this.context = new Context('user', 'server', user);

    this.updateViewQuery(viewQuery, false);

    let snapshotData = this.snapshot(userRef);

    socket.emit('syncable:initialize', {userRef, ...snapshotData});
  }

  // TODO: ability limit iteration within a subset of syncables to improve
  // performance.
  snapshot(
    userRef?: SyncableRef<IUserSyncableObject>,
    removals: SyncableRef[] = [],
  ): SnapshotData {
    let manager = this.manager;
    let context = this.context;

    let filter = this.filter;
    let snapshotIdSet = this.snapshotIdSet;

    let ensuredSyncableSet = new Set<ISyncable>();

    let snapshotSyncables: ISyncable[] = [];
    let snapshotRemovals = removals;

    if (userRef) {
      let userSyncable = manager.requireSyncable(userRef);
      ensureRelatedAndDoSnapshot(userSyncable, true);
    }

    for (let syncable of manager.getSyncables()) {
      ensureRelatedAndDoSnapshot(syncable, false);
    }

    return {
      syncables: snapshotSyncables,
      removals: snapshotRemovals,
    };

    function ensureRelatedAndDoSnapshot(
      syncable: ISyncable,
      requisite: boolean,
    ): void {
      if (ensuredSyncableSet.has(syncable)) {
        return;
      }

      ensuredSyncableSet.add(syncable);

      let {_id: id} = syncable;

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

      let relatedRefs = manager.getRelatedRefs(syncable);

      for (let ref of relatedRefs) {
        let syncable = manager.requireSyncable(ref);
        ensureRelatedAndDoSnapshot(syncable, true);
      }

      snapshotIdSet.add(id);
      snapshotSyncables.push(syncable);
    }
  }

  handleChangeResult({
    id,
    timestamp,
    updates: changeUpdates,
    removals: changeRemovals,
  }: ChangePlantProcessingResultWithTimestamp): void {
    let socket = this.socket;

    let snapshotData = this.snapshot(undefined, changeRemovals);

    let updates: SyncingDataUpdateEntry[] = [];

    let snapshotIdSet = this.snapshotIdSet;

    for (let {snapshot, diffs} of changeUpdates) {
      let ref = getSyncableRef(snapshot);
      let {id} = ref;

      if (snapshotIdSet.has(id)) {
        updates.push({
          ref,
          diffs,
        });
      }
    }

    let source: UpdateSource = {id, timestamp};

    socket.emit('syncable:sync', {
      source,
      updates,
      ...snapshotData,
    });
  }

  @observable private filter: ViewQueryFilter = () => false;

  private update(packet: ChangePacket): void {
    this.server.applyChangePacket(this.group, packet, this.context);
  }

  private updateViewQuery(query: unknown, snapshot = true): void {
    this.filter = this.server.getViewQueryFilter(query, this.context);

    if (snapshot) {
      let snapshotData = this.snapshot();
      this.socket.emit('syncable:sync', {...snapshotData});
    }
  }
}
