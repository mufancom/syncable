import _ from 'lodash';
import {observable} from 'mobx';

import {PermissionType} from '../access-control';
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

  get permissions(): PermissionType<TUser>[] {
    return [...(this.user.permissions as PermissionType<TUser>[])];
  }

  initialize(user: TUser): void {
    this.user = user;
  }

  testPermissions(permissions: PermissionType<TUser>[]): boolean {
    return _.difference(permissions, this.permissions).length === 0;
  }

  validatePermissions(permissions: PermissionType<TUser>[]): void {
    if (this.testPermissions(permissions)) {
      return;
    }

    throw new Error('Permission denied');
  }

  getRequisiteAssociations<T extends SyncableObject>(
    options: GetAssociationOptions<T> = {},
  ): T[] {
    return this.user.getRequisiteAssociations<T>(options);
  }
}
