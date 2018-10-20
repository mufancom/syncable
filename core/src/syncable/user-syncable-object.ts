import {Permission} from '../access-control';

import {ISyncable} from './syncable';
import {AbstractSyncableObject} from './syncable-object';

abstract class UserSyncableObject<
  T extends ISyncable = ISyncable,
  TPermission extends Permission = Permission
> extends AbstractSyncableObject<T> {
  get permissions(): TPermission[] {
    let associations = this.getRequisiteAssociations();
    let permissions = this.syncable._permissions || [];

    return associations
      .map(association => association.getGrantingPermissions() as TPermission[])
      .reduce(
        (flatten, grantingPermissions) => [...flatten, ...grantingPermissions],
        permissions as TPermission[],
      );
  }
}

export interface IUserSyncableObject<
  T extends ISyncable = ISyncable,
  TPermission extends Permission = Permission
> extends UserSyncableObject<T, TPermission> {}

export const AbstractUserSyncableObject = UserSyncableObject;
