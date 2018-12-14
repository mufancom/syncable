import {SyncableCreationRef} from '../change';
import {ISyncable, ISyncableObject, SyncableRef} from '../syncable';

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

export function getSyncableKey(
  syncableOrSyncableRef: ISyncable | SyncableRef,
): string {
  let type: string;
  let id: string;

  if ('_type' in syncableOrSyncableRef) {
    ({_type: type, _id: id} = syncableOrSyncableRef);
  } else {
    ({type, id} = syncableOrSyncableRef);
  }

  return `${type}:${id}`;
}
