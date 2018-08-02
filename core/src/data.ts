import {Syncable, SyncableRef, UserSyncableObject} from './syncable';

export interface SnapshotEventData<TUser extends UserSyncableObject> {
  syncables: Syncable[];
  userRef: SyncableRef<TUser>;
}
