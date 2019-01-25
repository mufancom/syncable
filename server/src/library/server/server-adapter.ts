import {
  ChangePacketId,
  ChangePlantProcessingResultUpdateItem,
  ISyncable,
  SyncableRef,
} from '@syncable/core';
import {Observable} from 'rxjs';

import {IConnectionSource} from '../connection';

import {IServerGenericParams} from './server';

export type QueuedChangeProcessor = (clock: number) => Promise<void>;

export interface BroadcastChangeResult {
  id: ChangePacketId;
  creations: ISyncable[];
  updates: ChangePlantProcessingResultUpdateItem[];
  removals: SyncableRef[];
}

export interface IServerAdapter<TGenericParams extends IServerGenericParams> {
  connectionSource$: Observable<IConnectionSource>;

  broadcast$: Observable<BroadcastChangeResult>;

  subscribe(group: string): Promise<void>;
  unsubscribe(group: string): Promise<void>;

  broadcast(group: string, data: BroadcastChangeResult): Promise<void>;

  queueChange(group: string, processor: QueuedChangeProcessor): Promise<void>;

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
