import {Syncable, SyncableRef} from '../syncable';
import {ChangePacketUID} from './change';

export interface ConsequentSeries {
  uid: ChangePacketUID;
  consequences: Consequence[];
}

export type Consequence =
  | ConsequentCreation
  | ConsequentRemoval
  | ConsequentUpdate;

export interface ConsequentCreation {
  type: 'creation';
  syncable: Syncable;
}

export interface ConsequentRemoval {
  type: 'removal';
  ref: SyncableRef;
}

export interface ConsequentUpdate {
  type: 'update';
  ref: SyncableRef;
  diffs: deepDiff.IDiff[];
}
