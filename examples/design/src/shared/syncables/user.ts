import {Syncable, SyncableId, UserSyncableObject} from '@syncable/core';

export type UserId = SyncableId<'user'>;

export interface UserSyncable extends Syncable<'user'> {
  name: string;
}

export class User extends UserSyncableObject<UserSyncable> {
  get name(): string {
    return this.syncable.name;
  }
}
