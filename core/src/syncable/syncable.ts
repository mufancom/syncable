import {AccessControlEntry, Permission} from '../access-control';
import {Dict, StringType} from '../lang';
import {SyncableObject} from './syncable-object';

export type SyncableId<Type extends string = string> = StringType<
  Type,
  'syncable-id'
>;

export interface SyncableRef<T extends Syncable = Syncable> {
  id: T['id'];
  type: T['type'];
}

export interface SyncableAssociation<T extends Syncable = Syncable> {
  ref: SyncableRef<T>;
  name?: string;
  requisite: true;
}

export interface Syncable<Type extends string = string> {
  id: SyncableId<Type>;
  type: Type;
  timestamp: number;

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
   * A dictionary of extra access control list to be attached by making this
   * object association of the target object.
   */
  $secures?: Dict<AccessControlEntry[] | false | undefined>;
}

///////////////
// Utilities //
///////////////

export type SyncableType<
  T extends SyncableRef | SyncableObject
> = T extends SyncableRef<infer TSyncable>
  ? TSyncable
  : T extends SyncableObject<infer TSyncable> ? T : never;

export type SyncableRefType<
  T extends SyncableObject
> = T extends SyncableObject<infer TSyncable> ? SyncableRef<TSyncable> : never;
