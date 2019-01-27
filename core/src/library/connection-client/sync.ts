import {Diff} from 'deep-diff';

import {ChangePacketId} from '../change';
import {ISyncable, SyncableRef} from '../syncable';

export interface SyncDataUpdateEntry {
  ref: SyncableRef;
  diffs: Diff<ISyncable>[];
}

export interface SyncData {
  syncables: ISyncable[];
  removals: SyncableRef[];
  updates: SyncDataUpdateEntry[];
}

export interface SyncUpdateSource {
  id: ChangePacketId;
  clock: number;
}
