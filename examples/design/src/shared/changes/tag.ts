import {
  ChangePlantBlueprint,
  IChange,
  SyncableCreationRef,
  SyncableRef,
  createSyncable,
} from '@syncable/core';

import {Tag, User} from '../syncables';

export type MFTagChange = TagTagChange | TagCreateChange;

export interface TagTagChangeOptions {
  foo: boolean;
}

export interface TagTagChangeRefDict {
  target: SyncableRef;
  tag: SyncableRef<Tag>;
}

export interface TagTagChange
  extends IChange<'tag:tag', TagTagChangeRefDict, TagTagChangeOptions> {}

export interface TagCreateChangeOptions {
  name: string;
}

export interface TagCreateChangeRefDict {
  tag: SyncableCreationRef<Tag>;
}

export interface TagCreateChange
  extends IChange<
      'tag:create',
      TagCreateChangeRefDict,
      TagCreateChangeOptions
    > {}

export const tagChangePlantBlueprint: ChangePlantBlueprint<
  User,
  MFTagChange
> = {
  'tag:tag'({}) {
    return {};
  },
  'tag:create'({}, {tag: tagRef}, {options: {name}}) {
    let tag = createSyncable<Tag>(tagRef, {
      name,
      derivations: [],
    });

    return {
      creations: [tag],
    };
  },
};
