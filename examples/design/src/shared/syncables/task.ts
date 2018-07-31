import {Syncable, SyncableId, SyncableObject} from '@syncable/core';

export type TaskId = SyncableId<'task'>;

export interface TaskSyncable extends Syncable<'task'> {
  owner: any;
}

export class Task extends SyncableObject<TaskSyncable> {}
