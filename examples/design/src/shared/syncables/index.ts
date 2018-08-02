import {Tag, TagSyncable} from './tag';
import {Task, TaskSyncable} from './task';
import {User, UserSyncable} from './user';

export type MFSyncable = TagSyncable | TaskSyncable | UserSyncable;
export type MFSyncableObject = Tag | Task | User;

export * from './tag';
export * from './task';
export * from './user';
