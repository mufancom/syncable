import {AbstractSyncableObject, SyncableRef} from '../syncable';

export function getSyncableRef<T extends AbstractSyncableObject>({
  _id,
  _type,
}: T['syncable']): SyncableRef<T> {
  return {id: _id, type: _type};
}
