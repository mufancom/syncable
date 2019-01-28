import {AbstractSyncableObject, ISyncable, SyncableId} from '@syncable/core';

export type UserId = SyncableId<'user'>;

export interface UserSyncable extends ISyncable<'user'> {
  group: string;
}

export class User extends AbstractSyncableObject<UserSyncable> {}
