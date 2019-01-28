import {SyncableRef, getSyncableKey} from '@syncable/core';
import {
  BroadcastChangeResult,
  Connection,
  IServerAdapter,
  QueuedChangeProcessor,
  ViewQueryFilter,
} from '@syncable/server';
import _ from 'lodash';
import {Observable, Subject, from} from 'rxjs';
import {delayWhen, filter, share} from 'rxjs/operators';
import * as v from 'villa';

import {syncablesInDatabase} from './@database';
import {randomNap} from './@utils';
import {Context} from './context';
import {ServerGenericParams} from './server';
import {Syncable, SyncableObject} from './syncables';
import {ViewQuery} from './view-query';

export class ServerAdapter implements IServerAdapter<ServerGenericParams> {
  private clock = 0;

  private subscribedGroupSet = new Set<string>();

  private syncables = _.cloneDeep(syncablesInDatabase);

  readonly broadcast$: Observable<BroadcastChangeResult>;

  constructor(
    readonly connection$: Subject<Connection<ServerGenericParams>>,
    private broadcastSource$: Subject<BroadcastChangeResult>,
  ) {
    this.broadcast$ = broadcastSource$.pipe(
      delayWhen(() => from(randomNap())),
      filter(data => this.subscribedGroupSet.has(data.group)),
      share(),
    );
  }

  async subscribe(group: string): Promise<void> {
    await randomNap();

    this.subscribedGroupSet.add(group);
  }

  async unsubscribe(group: string): Promise<void> {
    await randomNap();

    this.subscribedGroupSet.delete(group);
  }

  async broadcast(data: BroadcastChangeResult): Promise<void> {
    this.broadcastSource$.next(data);

    await randomNap();
  }

  async queueChange(
    group: string,
    processor: QueuedChangeProcessor,
  ): Promise<void> {
    await randomNap();

    await v.lock(group, async () => {
      await processor(++this.clock);
    });

    await randomNap();
  }

  getViewQueryFilter(_name: string, _query: object): ViewQueryFilter {
    return () => true;
  }

  async loadSyncablesByQuery(
    group: string,
    context: Context,
    queryObject: Partial<ViewQuery>,
    loadedKeySet: Set<string>,
  ): Promise<Syncable[]> {
    await randomNap();

    let filters: ViewQueryFilter<Syncable>[] = [];

    if ('default' in queryObject) {
      filters.push(syncable => syncable._id === context.data);
    }

    if ('task' in queryObject) {
      filters.push(syncable => syncable._type === 'task');
    }

    return this.syncables.filter(
      syncable =>
        syncable.group === group &&
        !loadedKeySet.has(getSyncableKey(syncable)) &&
        filters.some(filter => filter(syncable)),
    );
  }

  async loadSyncablesByRefs(
    group: string,
    refs: SyncableRef<SyncableObject>[],
  ): Promise<Syncable[]> {
    await randomNap();

    let keySet = new Set(refs.map(ref => getSyncableKey(ref)));

    return this.syncables.filter(
      syncable =>
        syncable.group === group && keySet.has(getSyncableKey(syncable)),
    );
  }

  async saveSyncables(
    _group: string,
    createdSyncables: Syncable[],
    updatedSyncables: Syncable[],
    removedSyncableRefs: SyncableRef<SyncableObject>[],
  ): Promise<void> {
    await randomNap();

    let syncables = this.syncables;

    let updatedKeySet = new Set(
      updatedSyncables.map(syncable => getSyncableKey(syncable)),
    );
    let removedKeySet = new Set(
      removedSyncableRefs.map(ref => getSyncableKey(ref)),
    );

    for (let i = 0; i < syncables.length; i++) {
      let syncable = syncables[i];
      let key = getSyncableKey(syncable);

      if (updatedKeySet.has(key)) {
        syncables[i] = _.cloneDeep(syncable);
      } else if (removedKeySet.has(key)) {
        syncables.splice(i, 1);
      }
    }

    syncables.push(..._.cloneDeep(createdSyncables));
  }

  async handleNotifications(
    _group: string,
    _notifications: never[],
  ): Promise<void> {}
}
