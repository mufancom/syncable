import {
  AbstractSyncableObject,
  AccessControlRule,
  Context,
  ISyncable,
  ISyncableObject,
  SyncableIdType,
} from '@syncable/core';
import _ from 'lodash';

import {User} from './user';

export interface TagMutualAssociationOptions {
  acceptDerivation?: boolean;
}

export interface TagSyncable extends ISyncable<'tag'> {
  name: string;
  derivations: string[];
}

export type TagId = SyncableIdType<TagSyncable>;

export class Tag extends AbstractSyncableObject<TagSyncable> {
  get name(): string {
    return this.syncable.name;
  }

  get derivations(): string[] {
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

  @AccessControlRule()
  protected 'require-mutual-association'(
    _target: ISyncableObject,
    context: Context<User>,
    {acceptDerivation = true}: TagMutualAssociationOptions = {},
  ): boolean {
    let tags = context.user.tags;

    return tags.some(tag => tag.is(this, acceptDerivation));
  }
}
