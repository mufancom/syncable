import {Context, SyncableRefType, UserSyncableObject} from '@syncable/core';

export abstract class ClientContext<
  User extends UserSyncableObject
> extends Context<User> {
  initialize(userRef: SyncableRefType<User>): void {
    this.user = this.require(userRef);
  }
}
