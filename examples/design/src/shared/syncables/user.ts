import {
  AbstractUserSyncableObject,
  ISyncable,
  SyncableIdType,
  SyncableRef,
} from '@syncable/core';

import {Tag} from './tag';

export interface UserSyncable extends ISyncable<'user'> {
  name: string;
  tags: SyncableRef<Tag>[];
}

export type UserId = SyncableIdType<UserSyncable>;

export class User extends AbstractUserSyncableObject<UserSyncable> {
  get name(): string {
    return this.syncable.name;
  }

  get tags(): Tag[] {
    return this.syncable.tags.map(ref => this.require(ref));
  }
}
