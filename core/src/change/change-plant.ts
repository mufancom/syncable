import * as DeepDiff from 'deep-diff';
import _ = require('lodash');

import {AccessRight} from '../access-control';
import {Dict, KeyOf} from '../lang';
import {Syncable, SyncableRef, SyncableType} from '../syncable';
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

export type ChangeToOutputDict<T extends Change> = T extends Change<
  string,
  infer RefDict
>
  ? {
      [K in keyof RefDict]: RefDict[K] extends SyncableRef
        ? ChangeOutput
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

export interface ChangeOutput {
  types: AccessRight[];
  diff: deepDiff.IDiff[];
}

export class ChangePlant<AllChange extends Change> {
  constructor(private blueprint: ChangePlantBlueprint<AllChange>) {}

  process<T extends AllChange>(
    {type, options}: T,
    objects: ChangeToObjectDict<T>,
  ): ChangeToOutputDict<T> {
    let blueprint = this.blueprint as Dict<ChangePlantProcessor<AllChange>>;
    let processor = blueprint[type];

    let keys = Object.keys(objects) as KeyOf<typeof objects, string>[];

    let snapshot = _.cloneDeep(objects);

    processor(objects, options);

    return keys.reduce(
      (dict, key) => {
        let current = snapshot[key];
        let next = objects[key];

        let diff = DeepDiff.diff(current, next);

        let accessTypeSet = new Set<string>();

        for (let change of diff) {
          if (change.path[0][0] === '$') {
            throw new Error();
          }
        }

        dict[key] = {
          types: ['write'],
          diff,
        };

        return dict;
      },
      {} as ChangeToOutputDict<T>,
    );
  }
}
