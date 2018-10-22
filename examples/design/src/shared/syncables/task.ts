import {
  AbstractSyncableObject,
  ISyncable,
  SyncableId,
  SyncableRef,
} from '@syncable/core';

import {Tag} from './tag';

export type TaskId = SyncableId<'task'>;

export interface TaskSyncable extends ISyncable<'task'> {
  owner: any;
  tags: SyncableRef<Tag>[];
}

export class Task extends AbstractSyncableObject<TaskSyncable> {}
