import {Nominal, OmitValueOfKey} from 'tslang';
import uuid from 'uuid';

import {
  AccessControlEntry,
  Permission,
  SecuringAccessControlEntry,
} from '../access-control';
import {SyncableCreationRef} from '../change';

import {AbstractSyncableObject} from './syncable-object';

export type SyncableId<Type extends string = string> = Nominal<
  string,
  [Type, 'syncable-id']
>;

export interface SyncableRef<
  T extends AbstractSyncableObject = AbstractSyncableObject
> {
  id: T['id'];
  type: T['type'];
}

export interface SyncableAssociation<
  T extends AbstractSyncableObject = AbstractSyncableObject
> {
  ref: SyncableRef<T>;
  name?: string;
  requisite?: boolean;
  secures?: boolean;
}

export interface ISyncable<Type extends string = string> {
  _id: SyncableId<Type>;
  _type: Type;
  _timestamp: number;

  /**
   * Object associations of this object.
   */
  _associations?: SyncableAssociation[];

  /**
   * Permissions of this object, only applied if this object is a user that
   * will be attached to a context.
   */
  _permissions?: Permission[];

  /**
   * Permissions that this object can grants a user.
   */
  _grants?: Permission[];

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
  T extends ISyncable | AbstractSyncableObject
> = T extends ISyncable
  ? T['_id']
  : T extends AbstractSyncableObject ? T['id'] : never;

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

export function createSyncableCreationRef<T extends AbstractSyncableObject>(
  type: T['type'],
): SyncableCreationRef<T> {
  return {
    type,
    id: uuid() as T['id'],
    creation: true,
  };
}

export function createSyncable<T extends AbstractSyncableObject>(
  type: T['type'] | SyncableCreationRef<T>,
  data: OmitValueOfKey<T['syncable'], '_id' | '_type' | '_timestamp'>,
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
