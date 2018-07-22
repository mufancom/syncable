import _ = require('lodash');

import {AccessControlRule, Context} from '../../context';
import {StringType} from '../../lang';
import {
  Syncable,
  SyncableId,
  SyncableObject,
  SyncableType,
} from '../../syncable';

export type TaskId = SyncableId<'task'>;

export interface TaskSyncable extends Syncable<'task'> {
  owner: any;
}

export class Task extends SyncableObject<TaskSyncable> {}

export type TagId = SyncableId<'tag'>;
export type TagName = StringType<'tag', 'name'>;

export interface TagMutualAssociationOptions {
  acceptDerivation?: boolean;
}

export interface TagSyncable extends Syncable<'tag'> {
  name: TagName;
  derivations: TagName[];
}

export class Tag extends SyncableObject<TagSyncable> {
  get name(): TagName {
    return this.syncable.name;
  }

  get derivations(): TagName[] {
    return this.syncable.derivations;
  }

  is(tag: Tag, acceptDerivation: boolean): boolean {
    if (this === tag) {
      return true;
    }

    let thisSequence = [...this.derivations, this.name];
    let comparisonSequence = [...tag.derivations, tag.name];

    thisSequence = acceptDerivation
      ? thisSequence.slice(0, comparisonSequence.length)
      : thisSequence;

    return _.isEqual(thisSequence, comparisonSequence);
  }

  @AccessControlRule<MFContext>()
  'require-mutual-association'(
    _target: SyncableObject,
    context: MFContext,
    {acceptDerivation = true}: TagMutualAssociationOptions = {},
  ): boolean {
    let tags = context.getRequisiteAssociations<Tag>({
      name: 'tag',
      type: 'tag',
    });

    return tags.some(tag => tag.is(this, acceptDerivation));
  }
}

export class MFContext extends Context {
  protected create<T extends SyncableObject>(syncable: SyncableType<T>): T {
    throw new Error('Method not implemented.');
  }
}
