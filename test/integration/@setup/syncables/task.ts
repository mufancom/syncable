import {AbstractSyncableObject, ISyncable, SyncableId} from '@syncable/core';

export type TaskId = SyncableId<'task'>;

export interface TaskSyncable extends ISyncable<'task'> {
  group: string;
  brief: string;
}

export class Task extends AbstractSyncableObject<TaskSyncable> {
  get brief(): string {
    return this.syncable.brief;
  }
}
