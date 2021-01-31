import {
  ChangePacketId,
  ChangePlantProcessingResultUpdateItem,
  ISyncable,
  SyncableRef,
  ViewQueryDictToResolvedViewQueryDict,
} from '@syncable/core';
import {Observable} from 'rxjs';
import {Dict} from 'tslang';

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

  queueChange(
    group: string,
    changePacketId: ChangePacketId,
    processor: QueuedChangeProcessor,
  ): Promise<void>;

  resolveQueryToContextDependencyRefsDict(
    context: TGenericParams['context'],
  ): Promise<Dict<SyncableRef[]>>;

  preloadQueryMetadata<
    TViewQueryName extends keyof TGenericParams['context']['queryMetadataDict']
  >(
    group: string,
    context: TGenericParams['context'],
    viewQueryName: TViewQueryName,
  ): Promise<TGenericParams['context']['queryMetadataDict'][TViewQueryName]>;

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
