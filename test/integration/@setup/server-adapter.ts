import {
  ChangePacketId,
  SyncableRef,
  ViewQueryDictToResolvedViewQueryDict,
  ViewQueryFilter,
  getSyncableKey,
} from '@syncable/core';
import {
  BroadcastChangeResult,
  Connection,
  IServerAdapter,
  QueuedChangeProcessor,
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
import {ViewQueryDict} from './view-query';

export class ServerAdapter implements IServerAdapter<ServerGenericParams> {
  private changePacketChangeIdSet = new Set<ChangePacketId>();

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
    id: ChangePacketId,
    group: string,
    processor: QueuedChangeProcessor,
  ): Promise<void> {
    await randomNap();

    if (this.changePacketChangeIdSet.has(id)) {
      return;
    } else {
      this.changePacketChangeIdSet.add(id);
    }

    await v.lock(group, async () => {
      await processor(++this.clock);
    });

    await randomNap();
  }

  async loadSyncablesByQuery(
    group: string,
    context: Context,
    resolvedViewQueryDict: Partial<
      ViewQueryDictToResolvedViewQueryDict<ViewQueryDict>
    >,
    loadedKeySet: Set<string>,
  ): Promise<Syncable[]> {
    await randomNap();

    let filters: ViewQueryFilter<Syncable>[] = [];

    if ('default' in resolvedViewQueryDict) {
      filters.push(
        syncable => getSyncableKey(syncable) === getSyncableKey(context.ref),
      );
    }

    if ('task' in resolvedViewQueryDict) {
      filters.push(syncable => syncable._type === 'task');
    }

    if ('kanban' in resolvedViewQueryDict) {
      let {kanban: kanbanSyncable} = resolvedViewQueryDict.kanban!.syncables;

      filters.push(
        syncable =>
          syncable._type === 'task' &&
          kanbanSyncable.tasks.includes(syncable._id),
      );
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
