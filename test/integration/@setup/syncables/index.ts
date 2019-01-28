import {Task, TaskSyncable} from './task';
import {User, UserSyncable} from './user';

export type Syncable = UserSyncable | TaskSyncable;

export type SyncableObject = User | Task;

export * from './task';
export * from './user';
