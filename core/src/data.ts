import {ChangePacketId} from './change';
import {ISyncable, IUserSyncableObject, SyncableRef} from './syncable';

export interface SyncingDataUpdateEntry {
  ref: SyncableRef;
  diffs: deepDiff.IDiff[];
}

export interface SnapshotData {
  syncables: ISyncable[];
  removals: SyncableRef[];
}

export interface InitialData<
  TUser extends IUserSyncableObject = IUserSyncableObject
> extends SnapshotData {
  userRef: SyncableRef<TUser>;
}

export interface UpdateData extends SnapshotData {
  source: UpdateSource;
  updates: SyncingDataUpdateEntry[];
}

export type SyncingData = SnapshotData | UpdateData;

export interface UpdateSource {
  id: ChangePacketId;
  timestamp: number;
}
