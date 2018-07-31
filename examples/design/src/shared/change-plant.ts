import {
  Change,
  ChangePlant,
  ChangePlantBlueprint,
  Syncable,
  SyncableRef,
} from '@syncable/core';
import {Tag, TagSyncable} from './syncables';

type SupportedChange = TagChange | CreateTagChange;

interface TagChangeOptions {
  foo: boolean;
}

interface TagChangeRefDict {
  target: SyncableRef;
  tag: SyncableRef<Tag>;
}

interface TagChange extends Change<'tag', TagChangeRefDict, TagChangeOptions> {}

interface CreateTagChange extends Change<'create-tag'> {}

const blueprint: ChangePlantBlueprint<SupportedChange> = {
  tag() {},
  'create-tag'() {
    return {};
  },
};

const changePlant = new ChangePlant(blueprint);

let change!: TagChange;

changePlant.process(change, {
  target: {} as Syncable,
  tag: {} as TagSyncable,
});
