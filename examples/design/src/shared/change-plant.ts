import {
  Change,
  ChangePlant,
  ChangePlantBlueprint,
  SyncableRef,
} from '@syncable/core';
import {TagSyncable} from './syncables';

type AllChange = TagChange;

interface TagChangeOptions {
  foo: boolean;
}

interface TagChangeRefDict {
  target: SyncableRef;
  tag: SyncableRef<TagSyncable>;
}

interface TagChange extends Change<'tag', TagChangeRefDict, TagChangeOptions> {}

const blueprint: ChangePlantBlueprint<AllChange> = {};

const changePlant = new ChangePlant(blueprint);

let change!: TagChange;

changePlant.process(change, {
  target: {} as Syncable,
  tag: {} as TagSyncable,
});
