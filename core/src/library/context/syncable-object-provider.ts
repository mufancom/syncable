import {AccessControlEntry} from '../access-control';
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

  abstract getDefaultACL(type: string): AccessControlEntry[];

  abstract resolveAssociations(syncable: ISyncable): SyncableAssociation[];
}

export interface ISyncableObjectProvider extends SyncableObjectProvider {}

export const AbstractSyncableObjectProvider = SyncableObjectProvider;
