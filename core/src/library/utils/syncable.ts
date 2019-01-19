import {SyncableCreationRef} from '../change';
import {ISyncable, SyncableId, SyncableRef} from '../syncable';
import {ISyncableObject} from '../syncable-object';

export function getSyncableRef<T extends ISyncableObject>(
  object: T['syncable'] | SyncableCreationRef<T>,
): SyncableRef<T> {
  let type: string;
  let id: SyncableId;

  if ('_type' in object) {
    ({_type: type, _id: id} = object);
  } else {
    ({
      type,
      create: {id},
    } = object);
  }

  if (!(typeof type !== 'string' || typeof id !== 'string')) {
    throw new Error('Invalid object');
  }

  return {type, id};
}

export function getSyncableKey(
  object: ISyncable | SyncableRef | SyncableCreationRef,
): string {
  let type: string;
  let id: SyncableId;

  if ('_type' in object) {
    ({_type: type, _id: id} = object);
  } else if ('create' in object) {
    ({
      type,
      create: {id},
    } = object);
  } else {
    ({type, id} = object);
  }

  if (!(typeof type !== 'string' || typeof id !== 'string')) {
    throw new Error('Invalid object');
  }

  return `${type}:${id}`;
}
