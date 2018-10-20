import {ISyncableObject, SyncableRef} from '../syncable';

export function getSyncableRef<T extends ISyncableObject>({
  _id,
  _type,
}: T['syncable']): SyncableRef<T> {
  return {id: _id, type: _type};
}
