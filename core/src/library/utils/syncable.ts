import {SyncableCreationRef} from '../change';
import {ISyncableObject, SyncableRef} from '../syncable';

export function getSyncableRef<T extends ISyncableObject>(
  object: SyncableCreationRef<T> | T['syncable'],
): SyncableRef<T> {
  let id;
  let type;

  if ('_id' in object) {
    ({_id: id, _type: type} = object);
  } else {
    ({id, type} = object);
  }

  return {id, type};
}
