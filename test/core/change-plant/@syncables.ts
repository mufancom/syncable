import {
  AbstractSyncableObject,
  ISyncable,
  SyncableId,
  createSyncable,
} from '@syncable/core';

export type TaskId = SyncableId<'task'>;

export interface TaskSyncable extends ISyncable<'task'> {
  brief: string;
}

export class Task extends AbstractSyncableObject<TaskSyncable> {
  get brief(): string {
    return this.syncable.brief;
  }
}

export const taskSyncableA = createSyncable<Task>(
  {
    type: 'task',
    create: {id: 'task-1' as TaskId},
  },
  {
    brief: 'This is task A!',
  },
);
