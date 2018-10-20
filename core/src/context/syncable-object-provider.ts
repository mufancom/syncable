import {ISyncable, ISyncableObject, SyncableManager} from '../syncable';

abstract class SyncableObjectProvider {
  abstract create(
    syncable: ISyncable,
    manager: SyncableManager,
  ): ISyncableObject;
}

export interface ISyncableObjectProvider extends SyncableObjectProvider {}

export const AbstractSyncableObjectProvider = SyncableObjectProvider;
