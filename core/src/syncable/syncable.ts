import {Nominal, OmitValueOfKey} from 'tslang';
import uuid from 'uuid';

import {
  AccessControlEntry,
  SecuringAccessControlEntry,
} from '../access-control';
import {SyncableCreationRef} from '../change';

import {ISyncableObject} from './syncable-object';

export type SyncableId<Type extends string = string> = Nominal<
  string,
  [Type, 'syncable-id']
>;

export interface SyncableRef<T extends ISyncableObject = ISyncableObject> {
  id: T['syncable']['_id'];
  type: T['syncable']['_type'];
}

export interface SyncableAssociation<
  T extends ISyncableObject = ISyncableObject
> {
  ref: SyncableRef<T>;
  secures?: boolean;
}

export interface SyncableExtends<TType extends string = string> {
  ref: {
    id: SyncableId<TType>;
    type: TType;
  };
  secures: boolean;
  acl: boolean;
}

export interface ISyncable<TType extends string = string> {
  _id: SyncableId<TType>;
  _type: TType;

  _extends?: SyncableExtends<TType>;

  _timestamp: number;

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

  /**
   * A list of extra access control entries to be attached by making this
   * object association of the target object.
   */
  _secures?: SecuringAccessControlEntry[];
}

///////////////
// Utilities //
///////////////

export type SyncableIdType<
  T extends ISyncable | ISyncableObject
> = T extends ISyncable
  ? T['_id']
  : T extends ISyncableObject ? T['id'] : never;

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
    id: uuid() as T['id'],
    creation: true,
  };
}

export type CreateSyncableExcludingKey = '_id' | '_type' | '_timestamp';

export function createSyncable<T extends ISyncableObject>(
  type: T['syncable']['_type'] | SyncableCreationRef<T>,
  data: OmitValueOfKey<T['syncable'], CreateSyncableExcludingKey>,
): T['syncable'] {
  let id: T['id'];

  if (typeof type === 'string') {
    id = uuid() as T['id'];
  } else {
    id = type.id;
    type = type.type;
  }

  let timestamp = 0;

  return {
    _id: id,
    _type: type,
    _timestamp: timestamp,
    ...(data as object),
  };
}
