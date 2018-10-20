import {
  ISyncable,
  ISyncableObject,
  SyncableAssociation,
  SyncableManager,
} from '../syncable';

abstract class SyncableObjectProvider {
  abstract create(
    syncable: ISyncable,
    manager: SyncableManager,
  ): ISyncableObject;

  abstract resolveAssociations(syncable: ISyncable): SyncableAssociation[];
}

export interface ISyncableObjectProvider extends SyncableObjectProvider {}

export const AbstractSyncableObjectProvider = SyncableObjectProvider;
