import _ from 'lodash';
import {observable} from 'mobx';

import {PermissionType} from '../access-control';
import {
  GetAssociationOptions,
  ISyncableObject,
  IUserSyncableObject,
} from '../syncable';

export type AccessControlRuleTester = (
  target: ISyncableObject,
  context: Context,
  options?: object,
) => boolean;

/**
 * Indicates whether a context is initiated by server or user (including the
 * correspondent user context on server).
 *
 * E.g. If a client connects to a server, the server creates a context with
 * type 'user'. But for some changes initiated by server API
 * (server.update(group, change)), the context has type 'server'.
 */
export type ContextType = 'server' | 'user';

export class Context<TUser extends IUserSyncableObject = IUserSyncableObject> {
  @observable user!: TUser;

  constructor(readonly type: ContextType, user?: TUser) {
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

  getRequisiteAssociations<T extends ISyncableObject>(
    options: GetAssociationOptions<T> = {},
  ): T[] {
    return this.user.getRequisiteAssociations<T>(options);
  }
}
