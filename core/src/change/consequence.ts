import {SyncableRef} from '../syncable';
import {ChangeUID} from './change';

export interface ConsequentSeries {
  uid: ChangeUID;
  consequences: Consequence[];
}

export type Consequence =
  | ConsequentCreation
  | ConsequentRemoval
  | ConsequentUpdate;

export interface ConsequentCreation {
  type: 'creation';
  snapshot: object;
}

export interface ConsequentRemoval {
  type: 'removal';
  ref: SyncableRef;
}

export interface ConsequentUpdate {
  type: 'update';
  ref: SyncableRef;
  diff: deepDiff.IDiff;
}
