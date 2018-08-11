import {
  Change,
  ChangePlant,
  ChangePlantBlueprint,
  Syncable,
  SyncableRef,
  createSyncable,
} from '@syncable/core';

import {Tag, TagName, TagSyncable} from './syncables';

export type MFChange = TagChange | CreateTagChange;

interface TagChangeOptions {
  foo: boolean;
}

interface TagChangeRefDict {
  target: SyncableRef;
  tag: SyncableRef<Tag>;
}

interface TagChange extends Change<'tag', TagChangeRefDict, TagChangeOptions> {}

interface CreateTagChange extends Change<'create-tag'> {}

const blueprint: ChangePlantBlueprint<MFChange> = {
  tag() {
    return {};
  },
  'create-tag'() {
    return {
      creations: [
        createSyncable<TagSyncable>('tag', {
          name: 'foo' as TagName,
          derivations: [],
        }),
      ],
    };
  },
};
