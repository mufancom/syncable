import {Syncable, SyncableRef} from './syncable';

export interface SnapshotEventData {
  syncables: Syncable[];
  userRef: SyncableRef;
}
