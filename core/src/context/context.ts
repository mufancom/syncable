import {observable} from 'mobx';

import {Permission} from '../access-control';
import {
  GetAssociationOptions,
  SyncableObject,
  UserSyncableObject,
} from '../syncable';

export type AccessControlRuleTester = (
  target: SyncableObject,
  context: Context,
  options?: object,
) => boolean;

export class Context<TUser extends UserSyncableObject = UserSyncableObject> {
  @observable user!: TUser;

  constructor(user?: TUser) {
    if (user) {
      this.user = user;
    }
  }

  get permissions(): Permission[] {
    return this.user.permissions;
  }

  initialize(user: TUser): void {
    this.user = user;
  }

  getRequisiteAssociations<T extends SyncableObject>(
    options: GetAssociationOptions<T> = {},
  ): T[] {
    return this.user.getRequisiteAssociations<T>(options);
  }
}
