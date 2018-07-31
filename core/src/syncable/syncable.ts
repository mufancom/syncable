import uuid = require('uuid');

import {AccessControlEntry, Permission} from '../access-control';
import {ExcludeProperty, StringType} from '../lang';
import {SyncableObject} from './syncable-object';

export type SyncableId<Type extends string = string> = StringType<
  [Type, 'syncable-id']
>;

export interface SyncableRef<T extends SyncableObject = SyncableObject> {
  id: T['id'];
  type: T['type'];
}

export interface SyncableAssociation<
  T extends SyncableObject = SyncableObject
> {
  ref: SyncableRef<T>;
  name?: string;
  requisite: boolean;
}

export interface Syncable<Type extends string = string> {
  $id: SyncableId<Type>;
  $type: Type;
  $timestamp: number;

  /**
   * Object associations of this object.
   */
  $associations?: SyncableAssociation[];

  /**
   * Permissions of this object, only applied if this object is a user that
   * will be attached to a context.
   */
  $permissions?: Permission[];

  /**
   * Permissions that this object can grants a user.
   */
  $grants?: Permission[];

  /**
   * Specific access control list of this object.
   */
  $acl?: AccessControlEntry[];

  /**
   * A list of extra access control entries to be attached by making this
   * object association of the target object.
   */
  $secures?: AccessControlEntry[];
}

///////////////
// Utilities //
///////////////

export type SyncableIdType<T extends SyncableObject> = T extends SyncableObject<
  infer TSyncable
>
  ? TSyncable['$id']
  : never;

export type SyncableObjectType<T extends SyncableRef> = T extends SyncableRef<
  infer TSyncableObject
>
  ? TSyncableObject
  : never;

export function createSyncable<T extends Syncable>(
  $type: T['$type'],
  data: ExcludeProperty<T, keyof Syncable>,
): T {
  let $id = uuid() as Syncable['$id'];
  let $timestamp = 0;

  return {
    $id,
    $type,
    $timestamp,
    ...(data as object),
  } as T;
}
