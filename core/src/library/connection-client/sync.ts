import {Delta} from 'jsondiffpatch';

import {ChangePacketId} from '../change';
import {ISyncable, SyncableRef} from '../syncable';

export interface SyncDataUpdateEntry {
  ref: SyncableRef;
  delta: Delta;
}

export interface SyncData<TQueryMetadata = object> {
  syncables: ISyncable[];
  removals: SyncableRef[];
  updates: SyncDataUpdateEntry[];
  queryMetadata: TQueryMetadata;
}

export interface SyncUpdateSource {
  id: ChangePacketId;
  clock: number;
  completed: boolean;
}
