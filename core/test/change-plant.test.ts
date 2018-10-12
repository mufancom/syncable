import {
  ChangePacketUID,
  ChangePlant,
  Context,
  SyncableCreationRef,
  createSyncable,
  getSyncableRef,
} from '../bld';

import {Task, TaskId, User, changePlantBlueprint} from './change-plant';

let context = new Context<User>('server');

let plant = new ChangePlant(changePlantBlueprint);

let taskSyncable = createSyncable<Task>(
  {
    creation: true,
    type: 'task',
    id: 'task-id' as TaskId,
  },
  {
    brief: 'hello, world.',
  },
);

let task = new Task(taskSyncable);

test('should update task brief', () => {
  let result = plant.process(
    {
      uid: 'change-packet-id' as ChangePacketUID,
      type: 'task:update-brief',
      refs: {
        task: getSyncableRef(taskSyncable),
      },
      options: {
        brief: 'hello, jest.',
      },
    },
    {
      task,
    },
    context,
  );

  expect(result).toMatchSnapshot();
});

test('should create task', () => {
  let taskRef: SyncableCreationRef<Task> = {
    creation: true,
    type: 'task',
    id: 'task-id' as TaskId,
  };

  let result = plant.process(
    {
      uid: 'change-packet-id' as ChangePacketUID,
      type: 'task:create',
      refs: {
        task: taskRef,
      },
      options: {
        brief: 'hello, create.',
      },
    },
    {
      task: taskRef,
    },
    context,
  );

  expect(result).toMatchSnapshot();
});

test('should remove task', () => {
  let result = plant.process(
    {
      uid: 'change-packet-id' as ChangePacketUID,
      type: 'task:remove',
      refs: {
        task: getSyncableRef(taskSyncable),
      },
      options: {},
    },
    {
      task,
    },
    context,
  );

  expect(result).toMatchSnapshot();
});
