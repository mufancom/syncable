import {SyncableObject, SyncableRef} from '../syncable';

export function getSyncableRef<T extends SyncableObject>({
  $id,
  $type,
}: T['syncable']): SyncableRef<T> {
  return {id: $id, type: $type};
}
