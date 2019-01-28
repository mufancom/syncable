import {ChangePlantBlueprint, SyncableRef} from '@syncable/core';

import {Context} from '../context';
import {Task} from '../syncables';

export type TaskChange = TaskUpdateTaskBriefChange;

export interface TaskUpdateTaskBriefChange {
  type: 'task:update-task-brief';
  refs: {
    task: SyncableRef<Task>;
  };
  options: {
    brief: string;
  };
}

export interface ChangePlantTaskBlueprintGenericParams {
  context: Context;
  change: TaskChange;
  dependencyResolveOptions: never;
  notification: never;
}

export const taskBlueprint: ChangePlantBlueprint<
  ChangePlantTaskBlueprintGenericParams
> = {
  'task:update-task-brief'({task}, {}, {options: {brief}}) {
    task.brief = brief;
  },
};
