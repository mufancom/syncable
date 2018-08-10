import * as DeepDiff from 'deep-diff';
import _ = require('lodash');

import {AccessRight} from '../access-control';
import {Dict} from '../lang';
import {Syncable, SyncableRef} from '../syncable';
import {
  AccessControlChange,
  accessControlChangePlantBlueprint,
} from './access-control-changes';
import {Change, GeneralChange} from './change';

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

export type ChangeToTypeDict<
  TChange extends Change,
  TType
> = TChange extends Change<string, infer TRefDict>
  ? Record<keyof TRefDict, TType>
  : never;

export interface ChangePlantProcessorOutputUpdateEntry {
  requisiteAccessRights?: AccessRight[];
}

export interface ChangePlantProcessorOutput<TChange extends Change> {
  updates?: Partial<
    ChangeToTypeDict<TChange, ChangePlantProcessorOutputUpdateEntry>
  >;
  creations?: Syncable[];
  removals?: SyncableRef[];
}

export interface ChangePlantProcessingResultUpdateItem {
  diffs: deepDiff.IDiff[];
  requisiteAccessRights: AccessRight[];
}

export interface ChangePlantProcessingResult {
  updates: Dict<ChangePlantProcessingResultUpdateItem>;
  creations: Syncable[];
  removals: SyncableRef[];
}

export type ChangePlantProcessor<TChange extends Change = Change> = (
  objects: ChangeToSyncableDict<TChange>,
  options: TChange['options'],
) => ChangePlantProcessorOutput<TChange> | void;

export type ChangePlantBlueprint<T extends Change> = {
  [K in T['type']]: ChangePlantProcessor<Extract<T, {type: K}>>
};

export class ChangePlant<TChange extends Change = Change> {
  constructor(private blueprint: ChangePlantBlueprint<TChange>) {}

  process(
    {type, options}: Change,
    syncableDict: Dict<Syncable>,
  ): ChangePlantProcessingResult {
    let processor = ((accessControlChangePlantBlueprint as Dict<
      ChangePlantProcessor<AccessControlChange> | undefined
    >)[type] ||
      (this.blueprint as Dict<ChangePlantProcessor<TChange> | undefined>)[
        type
      ]) as ChangePlantProcessor<GeneralChange>;

    let keys = Object.keys(syncableDict);

    let clonedSyncableDict = _.cloneDeep(syncableDict);

    let result = processor(clonedSyncableDict, options);

    let updateDict: Dict<ChangePlantProcessingResultUpdateItem> = {};
    let creations: Syncable[] | undefined;
    let removals: SyncableRef[] | undefined;

    if (result) {
      let processorUpdateDict = result.updates || {};
      let requireWriteRight = false;

      for (let key of keys) {
        let current = syncableDict[key];
        let next = clonedSyncableDict[key];

        let diffs = DeepDiff.diff(current, next);

        if (!diffs.length) {
          continue;
        }

        for (let diff of diffs) {
          let propertyName = diff.path[0];

          if (/^_/.test(propertyName) && /^[^$]/.test(type)) {
            throw new Error(
              `Invalid operation, use built-in change for built-in property \`${propertyName}\``,
            );
          }

          requireWriteRight = true;
        }

        let updateEntry = processorUpdateDict && processorUpdateDict[key];

        let requisiteAccessRights = Array.from(
          new Set([
            ...(requireWriteRight ? (['write'] as AccessRight[]) : undefined),
            ...(updateEntry && updateEntry.requisiteAccessRights),
          ]),
        );

        updateDict[key] = {
          diffs,
          requisiteAccessRights,
        };
      }

      creations = result.creations;
      removals = result.removals;
    }

    return {
      updates: updateDict,
      creations: creations || [],
      removals: removals || [],
    };
  }
}
