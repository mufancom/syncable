import {Syncable, SyncableManager, SyncableObject} from '../syncable';

export abstract class SyncableObjectFactory {
  abstract create(syncable: Syncable, manager: SyncableManager): SyncableObject;
}
