import * as DeepDiff from 'deep-diff';
import _ = require('lodash');

import {Dict, KeyOf} from '../lang';
import {SyncableRef, SyncableType} from '../syncable';
import {Change} from './change';

export type ChangeToObjectDict<T extends Change> = T extends Change<
  string,
  infer RefDict
>
  ? {
      [K in keyof RefDict]: RefDict[K] extends SyncableRef
        ? SyncableType<RefDict[K]>
        : never
    }
  : never;

export type ChangeToDiffsDict<T extends Change> = T extends Change<
  string,
  infer RefDict
>
  ? {
      [K in keyof RefDict]: RefDict[K] extends SyncableRef
        ? deepDiff.IDiff[]
        : never
    }
  : never;

export type ChangePlantProcessor<T extends Change = Change> = (
  objects: ChangeToObjectDict<T>,
  options: T['options'],
) => any;

export type ChangePlantBlueprint<T extends Change> = {
  [K in T['type']]: ChangePlantProcessor<Extract<T, {type: K}>>
};

export class ChangePlant<AllChange extends Change> {
  constructor(private blueprint: ChangePlantBlueprint<AllChange>) {}

  process<T extends AllChange>(
    {type, options}: T,
    objects: ChangeToObjectDict<T>,
  ): ChangeToDiffsDict<T> {
    let blueprint = this.blueprint as Dict<ChangePlantProcessor<AllChange>>;
    let processor = blueprint[type];

    let keys = Object.keys(objects) as KeyOf<ChangeToObjectDict<T>, string>[];

    let snapshot = _.cloneDeep(objects);

    processor(objects, options);

    return keys.reduce(
      (dict, key) => {
        let current = snapshot[key];
        let next = objects[key];

        let diffs = DeepDiff.diff(current, next);

        for (let change of diffs) {
          if (change.path[0][0] === '$') {
            throw new Error('');
          }
        }

        (dict as Dict<deepDiff.IDiff[]>)[key] = diffs;

        return dict;
      },
      {} as ChangeToDiffsDict<T>,
    );
  }
}
