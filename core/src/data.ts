import {ChangePacketUID} from './change';
import {Syncable, SyncableRef, UserSyncableObject} from './syncable';

export interface SyncingDataUpdateEntry {
  ref: SyncableRef;
  diffs: deepDiff.IDiff[];
}

export interface SnapshotData {
  syncables: Syncable[];
  removals: SyncableRef[];
}

export interface InitialData<
  TUser extends UserSyncableObject = UserSyncableObject
> extends SnapshotData {
  userRef: SyncableRef<TUser>;
}

export interface UpdateData extends SnapshotData {
  ack: ChangeAck;
  updates: SyncingDataUpdateEntry[];
}

export type SyncingData = SnapshotData | UpdateData;

export interface ChangeAck {
  uid: ChangePacketUID;
  timestamp: number;
}
