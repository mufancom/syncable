import {createSyncable} from '@syncable/core';

import {
  Kanban,
  KanbanId,
  Syncable,
  Task,
  TaskId,
  User,
  UserId,
} from './syncables';

export const syncablesInDatabase: Syncable[] = [
  createSyncable<User>(
    {
      type: 'user',
      create: {
        id: 'user-1' as UserId,
      },
    },
    {
      group: 'group-1',
    },
  ),
  createSyncable<Task>(
    {
      type: 'task',
      create: {id: 'task-1' as TaskId},
    },
    {
      group: 'group-1',
      brief: 'This is task 1',
    },
  ),
  createSyncable<Task>(
    {
      type: 'task',
      create: {id: 'task-2' as TaskId},
    },
    {
      group: 'group-1',
      brief: 'This is task 2',
    },
  ),
  createSyncable<Kanban>(
    {
      type: 'kanban',
      create: {id: 'kanban-1' as KanbanId},
    },
    {
      group: 'group-1',
      tasks: ['task-1' as TaskId],
    },
  ),
];
