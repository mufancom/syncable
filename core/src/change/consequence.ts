import {ChangeUID} from './change';
import {ResourceRef} from './resource';

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
  ref: ResourceRef;
}

export interface ConsequentUpdate {
  type: 'update';
  ref: ResourceRef;
  diff: deepDiff.IDiff;
}
