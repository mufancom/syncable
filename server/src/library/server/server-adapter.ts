import {
  ChangePacketId,
  ChangePlantProcessingResultUpdateItem,
  ISyncable,
  SyncableRef,
} from '@syncable/core';
import {Observable} from 'rxjs';

import {Connection} from '../connection';
import {ViewQueryFilter} from '../view-query';

import {IServerGenericParams} from './server';

export type QueuedChangeProcessor = (clock: number) => Promise<void>;

export interface BroadcastChangeResult {
  group: string;
  id: ChangePacketId;
  clock: number;
  creations: ISyncable[];
  updates: ChangePlantProcessingResultUpdateItem[];
  removals: SyncableRef[];
}

export interface IServerAdapter<
  TGenericParams extends IServerGenericParams = IServerGenericParams
> {
  connection$: Observable<Connection<TGenericParams>>;

  broadcast$: Observable<BroadcastChangeResult>;

  subscribe(group: string): Promise<void>;
  unsubscribe(group: string): Promise<void>;

  broadcast(group: string, data: BroadcastChangeResult): Promise<void>;

  queueChange(group: string, processor: QueuedChangeProcessor): Promise<void>;

  getViewQueryFilter(name: string, query: object): ViewQueryFilter;

  loadSyncablesByQuery(
    group: string,
    queryMap: Map<string, object>,
    loadedKeySet: Set<string>,
  ): Promise<ISyncable[]>;

  loadSyncablesByRefs(
    group: string,
    refs: SyncableRef<TGenericParams['syncableObject']>[],
  ): Promise<TGenericParams['syncableObject']['syncable'][]>;

  saveSyncables(
    group: string,
    createdSyncables: TGenericParams['syncableObject']['syncable'][],
    updatedSyncables: TGenericParams['syncableObject']['syncable'][],
    removedSyncableRefs: SyncableRef<TGenericParams['syncableObject']>[],
  ): Promise<void>;

  handleNotifications(
    group: string,
    notifications: TGenericParams['notification'][],
    id: ChangePacketId,
  ): Promise<void>;
}
