import {Diff} from 'deep-diff';

import {ChangePacketId} from '../change';
import {ISyncable, SyncableRef} from '../syncable';

export interface SyncingDataUpdateEntry {
  ref: SyncableRef;
  diffs: Diff<ISyncable>[];
}

export interface SyncingData {
  syncables: ISyncable[];
  removals: SyncableRef[];
  updates: SyncingDataUpdateEntry[];
}

export interface SyncingUpdateSource {
  id: ChangePacketId;
  timestamp: number;
}
