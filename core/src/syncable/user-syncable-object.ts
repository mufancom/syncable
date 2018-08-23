import {Permission} from '../access-control';

import {Syncable} from './syncable';
import {SyncableObject} from './syncable-object';

export class UserSyncableObject<
  T extends Syncable = Syncable,
  TPermission extends Permission = Permission
> extends SyncableObject<T> {
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
