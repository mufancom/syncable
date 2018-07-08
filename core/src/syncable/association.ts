import {Syncable, SyncableRef} from './syncable';

export interface Association<T extends Syncable = Syncable> {
  ref: SyncableRef<T>;
  name?: string;
  requisite: boolean;
}
