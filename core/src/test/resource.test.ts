import {
  AccessControlRuleSet,
  Context,
  Permission,
  Resource,
  ResourceRef,
  Syncable,
  SyncableId,
} from './legacy/index';

interface UserSyncable extends Syncable<'user'> {
  name: string;
}

class User extends Resource<UserSyncable> {
  get name(): string {
    return this.syncable.name;
  }
}

interface TagSyncable extends Syncable<'tag'> {
  label: string;
}

class Tag extends Resource<TagSyncable> {
  get label(): string {
    return this.syncable.label;
  }
}

interface TaskSyncable extends Syncable<'task'> {}

class Task extends Resource<TaskSyncable> {
  get tags(): Tag[] {
    return this.getRequisiteAssociatedResources('tag');
  }

  tag(tag: Tag): void {
    this.associate(tag, {
      requisite: true,
    });
  }

  untag(tag: Tag): void {
    this.unassociate(tag);
  }
}

let testContextRuleSet = new AccessControlRuleSet({
  'require-admin'(_resource, {grantedPermissions}) {
    return !!grantedPermissions.find(permission => permission.name === 'admin');
  },
});

type TestResource = User | Task | Tag;

class TestContext extends Context<User, TestResource> {
  constructor() {
    super(testContextRuleSet);

    context.registerResourceType('user', User);
    context.registerResourceType('tag', Tag);
    context.registerResourceType('task', Task);
  }

  initializeUser(ref: ResourceRef): void {
    this.user = this.get(ref);
  }

  protected createResource(syncable: TestResource['syncable']): TestResource {
    switch (syncable.type) {
      case 'user':
        return new User(syncable, this);
      case 'task':
        return new Task(syncable, this);
      case 'tag':
        return new Tag(syncable, this);
      default:
        throw new Error(`Invalid syncable type ${(syncable as Syncable).type}`);
    }
  }
}

let context = new TestContext();

context.addSyncable<Tag>({
  id: 'admin-tag' as SyncableId<TagSyncable>,
  type: 'tag',
  timestamp: 0,
  label: 'admin-tag',
  $grants: [{name: 'admin'}],
});

context.addSyncable<User>({
  id: 'user-1' as SyncableId<UserSyncable>,
  type: 'user',
  timestamp: 0,
  name: 'vilicvane',
  $associations: [
    {
      ref: {
        type: 'tag',
        id: 'admin-tag' as SyncableId<TagSyncable>,
      },
      requisite: true,
    },
  ],
});

context.initializeUser({
  type: 'user',
  id: 'user-1' as SyncableId<UserSyncable>,
});

context.addSyncable<Task>({
  id: 'task-1' as SyncableId<TaskSyncable>,
  type: 'task',
  timestamp: 0,
  $acl: [
    {
      name: 'require-admin',
      types: ['read', 'write', 'associate'],
    },
  ],
});

context.addSyncable<Tag>({
  id: 'tag-1' as SyncableId<TagSyncable>,
  type: 'tag',
  timestamp: 0,
  label: 'tag-1',
});

let task = context.get<Task>({
  type: 'task',
  id: 'task-1' as SyncableId<TaskSyncable>,
})!;

// tslint:disable-next-line:no-console
console.log(task.permittedAccessTypeSet);
