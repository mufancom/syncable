import _ from 'lodash';
import {action, observable} from 'mobx';

import {IUserSyncableObject} from './syncable-object';

/**
 * Indicates whether a context is initiated by server or user (including the
 * correspondent user context on server).
 *
 * E.g. If a client connects to a server, the server creates a context with
 * type 'user'. But for some changes initiated by server API
 * (server.update(group, change)), the context has type 'server'.
 */
export type ContextType = 'server' | 'user';

export type ContextEnvironment = 'server' | 'client';

export class Context<TUser extends IUserSyncableObject = IUserSyncableObject> {
  @observable user!: TUser;

  constructor(
    readonly type: ContextType,
    readonly environment: ContextEnvironment,
    user?: TUser,
  ) {
    if (user) {
      this.user = user;
    }
  }

  @action
  initialize(user: TUser): void {
    this.user = user;
  }
}
