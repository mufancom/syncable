import {
  Context,
  Resource,
  Syncable,
  Permission,
  AccessControlRuleSet,
  ResourceId,
  ResourceRef,
} from '..';

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

class TestContext extends Context {
  protected user: Resource<Syncable<string>> | undefined;
  protected permissions: Permission[] | undefined;

  initializeUser(ref: ResourceRef<User>): void {
    this.user = this.get(ref);
  }
}

let ruleSet = new AccessControlRuleSet({
  'require-admin'(_resource, {grantedPermissions}) {
    return !!grantedPermissions.find(permission => permission.name === 'admin');
  },
});

let context = new TestContext(ruleSet);

context.registerResourceType('user', User);
context.registerResourceType('tag', Tag);
context.registerResourceType('task', Task);

context.addSyncableToCache<Tag>({
  id: 'admin-tag' as ResourceId<Tag>,
  type: 'tag',
  label: 'admin-tag',
  $grants: [{name: 'admin'}],
});

context.addSyncableToCache<User>({
  id: 'user-1' as ResourceId<User>,
  type: 'user',
  name: 'vilicvane',
  $associations: [
    {
      ref: {
        type: 'tag',
        id: 'admin-tag' as ResourceId<Tag>,
      },
      requisite: true,
    },
  ],
});

context.initializeUser({type: 'user', id: 'user-1' as ResourceId<User>});

context.addSyncableToCache<Task>({
  id: 'task-1' as ResourceId<Task>,
  type: 'task',
  $acl: [
    {
      name: 'require-admin',
      types: ['read', 'write', 'associate'],
    },
  ],
});

context.addSyncableToCache<Tag>({
  id: 'tag-1' as ResourceId<Tag>,
  type: 'tag',
  label: 'tag-1',
});

let task = context.get<Task>({
  type: 'task',
  id: 'task-1' as ResourceId<Task>,
})!;

// tslint:disable-next-line:no-console
console.log(task.permittedAccessTypeSet);
