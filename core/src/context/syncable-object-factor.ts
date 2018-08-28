import {AbstractSyncableObject, ISyncable, SyncableManager} from '../syncable';

export abstract class AbstractSyncableObjectFactory {
  abstract create(
    syncable: ISyncable,
    manager: SyncableManager,
  ): AbstractSyncableObject;
}
