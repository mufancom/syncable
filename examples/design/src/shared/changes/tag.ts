import {
  Change,
  ChangePlantBlueprint,
  SyncableRef,
  createSyncable,
} from '@syncable/core';

import {Tag, TagSyncable} from '../syncables';

export type MFTagChange = TagChange | CreateTagChange;

export interface TagChangeOptions {
  foo: boolean;
}

export interface TagChangeRefDict {
  target: SyncableRef;
  tag: SyncableRef<Tag>;
}

export interface TagChange
  extends Change<'tag', TagChangeRefDict, TagChangeOptions> {}

export interface CreateTagChangeOptions {
  name: string;
}

export interface CreateTagChange
  extends Change<'create-tag', {}, CreateTagChangeOptions> {}

export const tagChangePlantBlueprint: ChangePlantBlueprint<MFTagChange> = {
  tag() {
    return {};
  },
  'create-tag'({}, {name}) {
    return {
      creations: [
        createSyncable<TagSyncable>('tag', {
          name,
          derivations: [],
        }),
      ],
    };
  },
};
