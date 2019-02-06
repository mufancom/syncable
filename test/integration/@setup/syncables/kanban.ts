import {AbstractSyncableObject, ISyncable, SyncableId} from '@syncable/core';

import {TaskId} from './task';

export type KanbanId = SyncableId<'kanban'>;

export interface KanbanSyncable extends ISyncable<'kanban'> {
  group: string;
  tasks: TaskId[];
}

export class Kanban extends AbstractSyncableObject<KanbanSyncable> {}
