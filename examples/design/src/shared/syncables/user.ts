import {
  AbstractUserSyncableObject,
  ISyncable,
  SyncableIdType,
} from '@syncable/core';

import {Tag} from './tag';

export interface UserSyncable extends ISyncable<'user'> {
  name: string;
}

export type UserId = SyncableIdType<UserSyncable>;

export type MFPermission = 'server' | 'sms';

export class User extends AbstractUserSyncableObject<
  UserSyncable,
  MFPermission
> {
  get name(): string {
    return this.syncable.name;
  }

  get tags(): Tag[] {
    return this.getRequisiteAssociations({
      name: 'tag',
      type: 'tag',
    });
  }
}
