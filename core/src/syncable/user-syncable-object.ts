import {Permission} from '../access-control';

import {Syncable} from './syncable';
import {SyncableObject} from './syncable-object';

export class UserSyncableObject<
  T extends Syncable = Syncable
> extends SyncableObject<T> {
  get permissions(): Permission[] {
    let associations = this.getRequisiteAssociations();
    let permissions = this.syncable._permissions || [];

    return associations
      .map(association => association.getGrantingPermissions())
      .reduce(
        (flatten, grantingPermissions) => [...flatten, ...grantingPermissions],
        permissions,
      );
  }
}
