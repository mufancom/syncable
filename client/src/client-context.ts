import {Context, SyncableRef, UserSyncableObject} from '@syncable/core';

export class ClientContext<
  TUser extends UserSyncableObject = UserSyncableObject
> extends Context<TUser> {
  initialize(userRef: SyncableRef<TUser>): void {
    this.user = this.require(userRef);
  }
}
