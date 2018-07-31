import {Tag, TagSyncable} from './tag';
import {Task, TaskSyncable} from './task';

export type MFSyncable = TagSyncable | TaskSyncable;
export type MFSyncableObject = Tag | Task;

export * from './tag';
export * from './task';
