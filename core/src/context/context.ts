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

  private _permissions: PermissionType<TUser>[];

  constructor(user?: TUser, permissions: PermissionType<TUser>[] = []) {
    if (user) {
      this.user = user;
    }

    this._permissions = permissions;
  }

  get permissions(): PermissionType<TUser>[] {
    return [
      ...this._permissions,
      ...(this.user.permissions as PermissionType<TUser>[]),
    ];
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
