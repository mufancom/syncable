import {Nominal, OmitValueOfKey} from 'tslang';

import {AccessControlEntry} from './access-control';
import {SyncableCreationRef} from './change';
import {ISyncableObject} from './syncable-object';
import {generateUniqueId} from './utils';

export type SyncableId<Type extends string = string> = Nominal<
  string,
  [Type, 'syncable-id']
>;

export interface SyncableRef<T extends ISyncableObject = ISyncableObject> {
  id: T['syncable']['_id'];
  type: T['syncable']['_type'];
}

export interface ISyncable<TType extends string = string> {
  _id: SyncableId<TType>;
  _type: TType;

  _clock: number;

  _updatedAt: number;

  _createdAt: number;

  /**
   * Permissions of this object, only applied if this object is a user that
   * will be attached to a context.
   */
  // _permissions?: Permission[];

  /**
   * Permissions that this object can grants a user.
   */
  // _grants?: Permission[];

  /**
   * Specific access control list of this object.
   */
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
