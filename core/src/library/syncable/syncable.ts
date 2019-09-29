import {Nominal, OmitValueOfKey} from 'tslang';

import {SyncableCreationRef} from '../change';
import {generateUniqueId} from '../utils';

import {AccessControlEntry} from './access-control';
import {ISyncableObject} from './syncable-object';

export type SyncableId<Type extends string = string> = Nominal<
  string,
  [Type, 'syncable-id']
>;

export interface SyncableRef<T extends ISyncableObject = ISyncableObject> {
  id: T['syncable']['_id'];
  type: T['syncable']['_type'];
}

export type SyncableRefType<
  T extends ISyncableObject = ISyncableObject
> = T extends ISyncableObject
  ? {
      id: T['syncable']['_id'];
      type: T['syncable']['_type'];
    }
  : never;

export interface ISyncable<TType extends string = string> {
  _type: TType;
  _id: SyncableId<TType>;
  _clock: number;
  _createdAt: number;
  _updatedAt: number;
  _acl?: AccessControlEntry[];
}

///////////////
// Utilities //
///////////////

export type SyncableIdType<
  T extends ISyncable | ISyncableObject
> = T extends ISyncable
  ? T['_id']
  : T extends ISyncableObject
  ? T['id']
  : never;

export type SyncableObjectType<T> = T extends SyncableRef<infer TSyncableObject>
  ? TSyncableObject
  : never;

export type SyncableType<T> = T extends SyncableCreationRef<
  infer TSyncableObject
>
  ? TSyncableObject['syncable']
  : T extends SyncableRef<infer TSyncableObject>
  ? TSyncableObject['syncable']
  : never;

export function createSyncableCreationRef<T extends ISyncableObject>(
  type: T['syncable']['_type'],
): SyncableCreationRef<T> {
  return {
    type,
    create: {
      id: generateUniqueId<T['id']>(),
    },
  };
}

export type CreateSyncableExcludingKey =
  | '_id'
  | '_type'
  | '_clock'
  | '_createdAt'
  | '_updatedAt';

export function createSyncable<T extends ISyncableObject>(
  type: T['syncable']['_type'] | SyncableCreationRef<T>,
  data: OmitValueOfKey<T['syncable'], CreateSyncableExcludingKey>,
): T['syncable'] {
  let id: T['id'];

  if (typeof type === 'string') {
    id = generateUniqueId<T['id']>();
  } else {
    ({
      type,
      create: {id},
    } = type);
  }

  return {
    _id: id,
    _type: type,
    _clock: 0,
    _createdAt: 0,
    _updatedAt: 0,
    ...(data as object),
  };
}

export function getSyncableRef<T extends ISyncableObject>(
  source: string | T['syncable'] | SyncableCreationRef<T>,
): SyncableRef<T>;
export function getSyncableRef(
  source: string | ISyncable | SyncableCreationRef,
): SyncableRef {
  let type: string;
  let id: SyncableId;

  if (typeof source === 'string') {
    [type, id] = source.split(':') as [string, SyncableId];
  } else if ('_type' in source) {
    ({_type: type, _id: id} = source);
  } else {
    ({
      type,
      create: {id},
    } = source);
  }

  if (typeof type !== 'string' || typeof id !== 'string') {
    throw new Error('Invalid source');
  }

  return {type, id};
}

export function getSyncableKey(
  source: ISyncable | SyncableRef | SyncableCreationRef,
): string {
  let type: string;
  let id: SyncableId;

  if ('_type' in source) {
    ({_type: type, _id: id} = source);
  } else if ('create' in source) {
    ({
      type,
      create: {id},
    } = source);
  } else {
    ({type, id} = source);
  }

  if (typeof type !== 'string' || typeof id !== 'string') {
    throw new Error('Invalid source');
  }

  return `${type}:${id}`;
}
