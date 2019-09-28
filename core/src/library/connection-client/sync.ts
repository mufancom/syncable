import {Delta} from 'jsondiffpatch';

import {ChangePacketId} from '../change';
import {ISyncable, SyncableRef} from '../syncable';

export interface SyncDataUpdateEntry {
  ref: SyncableRef;
  delta: Delta;
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
