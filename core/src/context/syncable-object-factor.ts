import {ISyncable, ISyncableObject, SyncableManager} from '../syncable';

abstract class SyncableObjectFactory {
  abstract create(
    syncable: ISyncable,
    manager: SyncableManager,
  ): ISyncableObject;
}

export interface ISyncableObjectFactory extends SyncableObjectFactory {}

export const AbstractSyncableObjectFactory = SyncableObjectFactory;
