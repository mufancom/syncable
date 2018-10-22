import {
  ChangePacketId,
  ChangePlant,
  Context,
  ISyncableObjectProvider,
  SyncableCreationRef,
  SyncableManager,
  createSyncable,
  getSyncableRef,
} from '../bld';

import {
  Syncable,
  Tag,
  Task,
  TaskId,
  User,
  UserId,
  changePlantBlueprint,
} from './change-plant';

let context = new Context<User>('server');

let provider: ISyncableObjectProvider = {
  create(syncable: Syncable, manager) {
    switch (syncable._type) {
      case 'user':
        return new User(syncable, manager);
      case 'task':
        return new Task(syncable, manager);
      case 'tag':
        return new Tag(syncable, manager);
    }
  },
  resolveAssociations() {
    return [];
  },
};

let plant = new ChangePlant(changePlantBlueprint, provider);

let manager = new SyncableManager(provider);

let userSyncable = createSyncable<User>(
  {
    creation: true,
    type: 'user',
    id: 'user-id' as UserId,
  },
  {},
);

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

manager.addSyncable(userSyncable);
manager.addSyncable(taskSyncable);

test('should update task brief', () => {
  let result = plant.process(
    {
      id: 'change-packet-id' as ChangePacketId,
      type: 'task:update-brief',
      refs: {
        task: getSyncableRef(taskSyncable),
      },
      options: {
        brief: 'hello, jest.',
      },
    },
    {
      task: manager.requireSyncableObject(getSyncableRef(taskSyncable)),
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
      id: 'change-packet-id' as ChangePacketId,
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
      id: 'change-packet-id' as ChangePacketId,
      type: 'task:remove',
      refs: {
        task: getSyncableRef(taskSyncable),
      },
      options: {},
    },
    {
      task: manager.requireSyncableObject(getSyncableRef(taskSyncable)),
    },
    context,
  );

  expect(result).toMatchSnapshot();
});
