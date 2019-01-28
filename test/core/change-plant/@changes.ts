import {SyncableRef} from '@syncable/core';

import {Task} from './@syncables';

export type Change = TaskUpdateTaskBriefChange;

export interface TaskUpdateTaskBriefChange {
  type: 'task:update-task-brief';
  refs: {
    task: SyncableRef<Task>;
  };
  options: {
    brief: string;
  };
}
