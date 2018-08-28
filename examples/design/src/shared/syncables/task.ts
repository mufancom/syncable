import {AbstractSyncableObject, ISyncable, SyncableId} from '@syncable/core';

export type TaskId = SyncableId<'task'>;

export interface TaskSyncable extends ISyncable<'task'> {
  owner: any;
}

export class Task extends AbstractSyncableObject<TaskSyncable> {}
