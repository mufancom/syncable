import * as DeepDiff from 'deep-diff';
import _ = require('lodash');

import {AccessRight} from '../access-control';
import {Dict, KeyOf} from '../lang';
import {Syncable, SyncableRef} from '../syncable';
import {
  AccessControlChange,
  accessControlChangePlantBlueprint,
} from './access-control-changes';
import {Change} from './change';

export type RefDictToObjectDict<T extends object> = T extends object
  ? {
      [K in keyof T]: T[K] extends SyncableRef<infer TSyncableObject>
        ? TSyncableObject
        : never
    }
  : never;

export type ChangeToObjectDict<T extends Change> = T extends Change<
  string,
  infer TRefDict
>
  ? RefDictToObjectDict<TRefDict>
  : never;

export type RefDictToSyncableDict<T extends object> = T extends object
  ? {
      [K in keyof T]: T[K] extends SyncableRef<infer TSyncableObject>
        ? TSyncableObject['syncable']
        : never
    }
  : never;

export type ChangeToSyncableDict<T extends Change> = T extends Change<
  string,
  infer TRefDict
>
  ? RefDictToSyncableDict<TRefDict>
  : never;

export interface ChangeOutput {
  diffs: deepDiff.IDiff[] | undefined;
  rights: AccessRight[] | undefined;
}

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

export interface ChangePlantProcessingResult {
  rights?: AccessRight[];
  creations?: Syncable[];
  removals?: SyncableRef[];
}

export interface ChangePlantProcessingResultEntry
  extends ChangePlantProcessingResult {
  ref: SyncableRef;
}

export type ChangePlantProcessor<T extends Change = Change> = (
  objects: ChangeToSyncableDict<T>,
  options: T['options'],
) => ChangePlantProcessingResult | void;

export type ChangePlantBlueprint<T extends Change> = {
  [K in T['type']]: ChangePlantProcessor<Extract<T, {type: K}>>
};

export class ChangePlant<TChange extends Change = Change> {
  constructor(private blueprint: ChangePlantBlueprint<TChange>) {}

  process<T extends TChange | AccessControlChange>(
    {type, options}: T,
    syncableDict: ChangeToSyncableDict<T>,
  ): ChangeToOutputDict<T> {
    let processor = ((accessControlChangePlantBlueprint as Dict<
      ChangePlantProcessor<AccessControlChange> | undefined
    >)[type] ||
      (this.blueprint as Dict<ChangePlantProcessor<TChange> | undefined>)[
        type
      ]) as ChangePlantProcessor<T>;

    let keys = Object.keys(syncableDict) as KeyOf<
      ChangeToSyncableDict<T>,
      string
    >[];

    let clonedSyncableDict = _.cloneDeep(syncableDict);

    let result = processor(clonedSyncableDict, options) as
      | ChangePlantProcessingResult
      | undefined;

    return keys.reduce(
      (dict, key) => {
        let current = syncableDict[key];
        let next = clonedSyncableDict[key];

        let diffs = DeepDiff.diff(current, next);

        for (let diff of diffs) {
          let propertyName = diff.path[0];

          if (/^\$/.test(propertyName) && /^[^$]/.test(type)) {
            throw new Error(
              `Invalid operation, use built-in change for built-in property \`${propertyName}\``,
            );
          }
        }

        (dict as Dict<ChangeOutput>)[key] = {rights, diffs};

        return dict;
      },
      {} as ChangeToOutputDict<T>,
    );
  }
}
