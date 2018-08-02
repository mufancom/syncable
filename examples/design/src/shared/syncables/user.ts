import {Syncable, SyncableId, UserSyncableObject} from '@syncable/core';

export type UserId = SyncableId<'user'>;

export interface UserSyncable extends Syncable<'user'> {}

export class User extends UserSyncableObject<UserSyncable> {}
