import {Permission} from '../access-control';

import {ISyncable} from './syncable';
import {AbstractSyncableObject} from './syncable-object';

export abstract class AbstractUserSyncableObject<
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
