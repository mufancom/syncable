import {
  ChangePacketId,
  ChangePlantProcessingResultUpdateItem,
  IContext,
  ISyncable,
  ResolvedViewQuery,
  SyncableRef,
  ViewQueryDictToResolvedViewQueryDict,
  ViewQueryFilter,
} from '@syncable/core';
import {Observable} from 'rxjs';

import {Connection} from '../connection';

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

  broadcast(data: BroadcastChangeResult): Promise<void>;

  queueChange(group: string, processor: QueuedChangeProcessor): Promise<void>;

  getViewQueryFilter(
    context: IContext,
    name: string,
    query: ResolvedViewQuery,
  ): ViewQueryFilter;

  loadSyncablesByQuery(
    group: string,
    context: TGenericParams['context'],
    resolvedViewQueryDict: Partial<
      ViewQueryDictToResolvedViewQueryDict<TGenericParams['viewQueryDict']>
    >,
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
