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
import {Subject} from 'rxjs';
import {debounceTime} from 'rxjs/operators';

import {IServer, ServerGenericParams, ViewQueryFilter} from './server';

const SNAPSHOT_DEBOUNCING_TIME = 100;

export interface ConnectionSocket extends SocketIO.Socket {
  on(event: 'syncable:view-query', listener: (query: unknown) => void): this;
  on(event: 'syncable:change', listener: (packet: ChangePacket) => void): this;
  on(event: 'syncable:request', listener: (ref: SyncableRef) => void): this;
  on(event: 'disconnect', listener: () => void): this;
  on(event: 'error', listener: (error: any) => void): this;

  emit(event: 'syncable:initialize', data: InitialData): boolean;
  emit(event: 'syncable:sync', data: SyncingData): boolean;
  emit(event: 'syncable:complete-requests', refs: SyncableRef[]): boolean;
}

export class Connection<TServerGenericParams extends ServerGenericParams> {
  private context!: Context;
  private snapshotIdSet = new Set<SyncableId>();

  private filter: ViewQueryFilter;

  private requestedSyncableSet = new Set<ISyncable>();
  private pendingRequestedRefs: SyncableRef[] = [];

  private snapshotScheduler = new Subject<boolean>();

  constructor(
    readonly group: string,
    private socket: ConnectionSocket,
    private server: IServer<TServerGenericParams>,
    private manager: SyncableManager,
  ) {
    // Avoid filter being treated as a method (tslint member-ordering rule).
    this.filter = () => false;
  }

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
      })
      .on('syncable:request', ref => {
        this.request(ref);
      });

    let user = manager.requireSyncableObject(userRef);

    this.context = new Context('user', 'server', user);

    this.updateViewQuery(viewQuery, false);

    socket.emit('syncable:initialize', {userRef, ...this.snapshot(userRef)});

    this.snapshotScheduler
      .pipe(debounceTime(SNAPSHOT_DEBOUNCING_TIME))
      .subscribe(toSnapshot => {
        if (!toSnapshot) {
          return;
        }

        this.sync(this.snapshot());
      });
  }

  // TODO: ability limit iteration within a subset of syncables to improve
  // performance.
  snapshot(
    userRef?: SyncableRef<IUserSyncableObject>,
    removals: SyncableRef[] = [],
  ): SnapshotData {
    this.snapshotScheduler.next(false);

    let manager = this.manager;
    let context = this.context;

    let filter = this.filter;
    let snapshotIdSet = this.snapshotIdSet;
    let requestedSyncableSet = this.requestedSyncableSet;

    let iteratedSyncableSet = new Set<ISyncable>();

    let snapshotSyncables: ISyncable[] = [];
    let snapshotRemovals = [...removals];

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
      ignoreFilter: boolean,
    ): void {
      if (iteratedSyncableSet.has(syncable)) {
        return;
      }

      iteratedSyncableSet.add(syncable);

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

      let alreadyBeenSnapshot = snapshotIdSet.has(id);
      let shouldBeSnapshot =
        alreadyBeenSnapshot ||
        ignoreFilter ||
        requestedSyncableSet.has(syncable) ||
        filter(object);

      if (!shouldBeSnapshot) {
        return;
      }

      let relatedRefs = manager.getRelatedRefs(syncable);

      for (let ref of relatedRefs) {
        let syncable = manager.getSyncable(ref);

        if (syncable) {
          ensureRelatedAndDoSnapshot(syncable, true);
        }
      }

      if (alreadyBeenSnapshot) {
        return;
      }

      snapshotIdSet.add(id);
      snapshotSyncables.push(syncable);
    }
  }

  handleChangeResult({
    id,
    timestamp,
    updates: changeUpdates,
    removals,
  }: ChangePlantProcessingResultWithTimestamp): void {
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

    this.sync({
      source,
      updates,
      ...this.snapshot(undefined, removals),
    });
  }

  private update(packet: ChangePacket): void {
    this.server.applyChangePacket(this.group, packet, this.context);
  }

  private updateViewQuery(query: unknown, snapshot = true): void {
    this.filter = this.server.getViewQueryFilter(
      query,
      this.context,
      this.manager,
    );

    if (snapshot) {
      this.snapshotScheduler.next(true);
    }
  }

  private request(ref: SyncableRef): void {
    let manager = this.manager;

    let syncable = manager.getSyncable(ref);

    if (syncable) {
      this.pendingRequestedRefs.push(ref);
      this.requestedSyncableSet.add(syncable);
      this.snapshotScheduler.next(true);
    } else {
      this.completeRequests([ref]);
    }
  }

  private sync(data: SyncingData): void {
    this.socket.emit('syncable:sync', data);

    let pendingRequestedRefs = this.pendingRequestedRefs;

    if (pendingRequestedRefs.length) {
      this.completeRequests(pendingRequestedRefs);
      this.pendingRequestedRefs = [];
    }
  }

  private completeRequests(refs: SyncableRef[]): void {
    this.socket.emit('syncable:complete-requests', refs);
  }
}
