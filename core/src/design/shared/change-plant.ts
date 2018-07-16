import {Change, ChangePlant, ChangePlantBlueprint} from '../../change';
import {Syncable, SyncableRef} from '../../syncable';
import {TagSyncable} from './tag';

type AllChange = TagChange;

interface TagChangeOptions {
  foo: boolean;
}

interface TagChangeRefDict {
  target: SyncableRef;
  tag: SyncableRef<TagSyncable>;
}

interface TagChange extends Change<'tag', TagChangeRefDict, TagChangeOptions> {}

const blueprint: ChangePlantBlueprint<AllChange> = {
  tag({target, tag}, options): void {},
};

const changePlant = new ChangePlant(blueprint);

let change!: TagChange;

changePlant.process(change, {
  target: {} as Syncable,
  tag: {} as TagSyncable,
});
