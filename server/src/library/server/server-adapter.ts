import {
  ChangePacketId,
  ChangePlantProcessingResultUpdateItem,
  IChangeNotification,
  ISyncable,
  SyncableRef,
} from '@syncable/core';
import {Observable} from 'rxjs';

import {IConnectionSource} from '../connection';

export type QueuedChangeProcessor = (clock: number) => Promise<void>;

export interface BroadcastChangeResult {
  id: ChangePacketId;
  creations: ISyncable[];
  updates: ChangePlantProcessingResultUpdateItem[];
  removals: SyncableRef[];
}

export interface IServerAdapter {
  connectionSource$: Observable<IConnectionSource>;

  broadcast$: Observable<BroadcastChangeResult>;

  subscribe(group: string): Promise<void>;
  unsubscribe(group: string): Promise<void>;

  broadcast(group: string, data: BroadcastChangeResult): Promise<void>;

  queueChange(group: string, processor: QueuedChangeProcessor): Promise<void>;

  loadSyncablesByRefs(group: string, refs: SyncableRef[]): Promise<ISyncable[]>;

  saveSyncables(
    group: string,
    createdSyncables: ISyncable[],
    updatedSyncables: ISyncable[],
    removedSyncableRefs: SyncableRef[],
  ): Promise<void>;

  handleNotifications(
    group: string,
    notifications: IChangeNotification[],
  ): Promise<void>;
}
