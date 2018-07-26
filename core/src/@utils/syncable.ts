import {Syncable, SyncableRef} from '../syncable';

export function getRef<T extends Syncable>({
  $id,
  $type,
}: Syncable): SyncableRef<T> {
  return {id: $id, type: $type};
}
