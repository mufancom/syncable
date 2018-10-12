import {
  ChangePlantBlueprint,
  IChange,
  SyncableCreationRef,
  SyncableRef,
  createSyncable,
} from '../../bld';

import {Task, User} from './models';

export const changePlantBlueprint: ChangePlantBlueprint<User, Change> = {
  'task:update-brief'({task}, {}, {options: {brief}}) {
    task.brief = brief;
  },
  'task:create'({}, {task: taskRef}, {create, options: {brief}}) {
    let syncable = createSyncable(taskRef, {brief});
    create(syncable);
  },
  'task:remove'({task}, {}, {remove}) {
    remove(task);
  },
};

type Change = TaskChange;

type TaskChange = TaskUpdateBriefChange | TaskRemoveChange | TaskCreateChange;

///////////////////////
// task:update-brief //
///////////////////////

interface TaskUpdateBriefChangeRefDict {
  task: SyncableRef<Task>;
}

interface TaskUpdateBriefChangeOptions {
  brief: string;
}

interface TaskUpdateBriefChange
  extends IChange<
      'task:update-brief',
      TaskUpdateBriefChangeRefDict,
      TaskUpdateBriefChangeOptions
    > {}

/////////////////
// task:create //
/////////////////

interface TaskCreateChangeRefDict {
  task: SyncableCreationRef<Task>;
}

interface TaskCreateChangeOptions {
  brief: string;
}

interface TaskCreateChange
  extends IChange<
      'task:create',
      TaskCreateChangeRefDict,
      TaskCreateChangeOptions
    > {}

/////////////////
// task:remove //
/////////////////

interface TaskRemoveChangeRefDict {
  task: SyncableRef<Task>;
}

interface TaskRemoveChangeOptions {}

interface TaskRemoveChange
  extends IChange<
      'task:remove',
      TaskRemoveChangeRefDict,
      TaskRemoveChangeOptions
    > {}

/*$

@name: "task-change"
@insert: {
  "match": "^type TaskChange =[^]*?(?:never)?(?=;)",
  "content": "|Task${name.CamelCase}Change"
}

$comment-block: "task:${name.hyphenated}"

interface Task${name.CamelCase}ChangeRefDict {}

interface Task${name.CamelCase}ChangeOptions {}

interface Task${name.CamelCase}Change
  extends IChange<
      'task:${name.hyphenated}',
      Task${name.CamelCase}ChangeRefDict,
      Task${name.CamelCase}ChangeOptions,
    > {}

*/
