import {
  AbstractSyncableObject,
  AbstractUserSyncableObject,
  ISyncable,
  SyncableId,
} from '../../bld';

export type UserId = SyncableId<'user'>;

export interface UserSyncable extends ISyncable<'user'> {}

export class User extends AbstractUserSyncableObject<UserSyncable> {}

export type TaskId = SyncableId<'task'>;

export interface TaskSyncable extends ISyncable<'task'> {
  brief: string;
}

export class Task extends AbstractSyncableObject<TaskSyncable> {
  get brief(): string {
    return this.syncable.brief;
  }
}

export type TagId = SyncableId<'tag'>;

export interface TagSyncable extends ISyncable<'tag'> {
  name: string;
}

export class Tag extends AbstractSyncableObject<TagSyncable> {
  get name(): string {
    return this.syncable.name;
  }
}
