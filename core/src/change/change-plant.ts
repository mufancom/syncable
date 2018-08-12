import * as DeepDiff from 'deep-diff';
import _ = require('lodash');

import {Context} from '../context';
import {Dict} from '../lang';
import {Syncable, SyncableObject, SyncableRef} from '../syncable';

import {
  AccessControlChange,
  accessControlChangePlantBlueprint,
} from './access-control-changes';
import {Change, GeneralChange} from './change';

export type RefDictToSyncableObjectDict<T extends object> = T extends object
  ? {
      [K in keyof T]: T[K] extends SyncableRef<infer TSyncableObject>
        ? TSyncableObject
        : never
    }
  : never;

export type ChangeToSyncableObjectDict<T extends Change> = T extends Change<
  string,
  infer TRefDict
>
  ? RefDictToSyncableObjectDict<TRefDict>
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

export interface ChangePlantProcessorOutput {
  creations?: Syncable[];
  removals?: string[];
}

export interface ChangePlantProcessingResultUpdateItem {
  diffs: deepDiff.IDiff[];
  snapshot: Syncable;
}

export interface ChangePlantProcessingResult {
  updates: Dict<ChangePlantProcessingResultUpdateItem>;
  creations: Syncable[];
  removals: SyncableRef[];
}

export interface ChangePlantProcessorOptions<TChange extends Change> {
  objects: ChangeToSyncableObjectDict<TChange>;
  context: Context;
}

export type ChangePlantProcessor<TChange extends Change = Change> = (
  syncables: ChangeToSyncableDict<TChange>,
  options: ChangePlantProcessorOptions<TChange> & TChange['options'],
) => ChangePlantProcessorOutput | void;

export type ChangePlantBlueprint<T extends Change> = {
  [K in T['type']]: ChangePlantProcessor<Extract<T, {type: K}>>
};

export class ChangePlant<TChange extends Change = Change> {
  constructor(private blueprint: ChangePlantBlueprint<TChange>) {}

  process(
    {type, options}: Change,
    syncableObjectDict: Dict<SyncableObject>,
    context: Context,
  ): ChangePlantProcessingResult {
    let processor = ((accessControlChangePlantBlueprint as Dict<
      ChangePlantProcessor<AccessControlChange> | undefined
    >)[type] ||
      (this.blueprint as Dict<ChangePlantProcessor<TChange> | undefined>)[
        type
      ]) as ChangePlantProcessor<GeneralChange>;

    let keys = Object.keys(syncableObjectDict);

    let syncableDict = _.mapValues(syncableObjectDict, 'syncable');
    let clonedSyncableDict = _.mapValues(syncableDict, syncable =>
      _.cloneDeep(syncable),
    );

    let result = processor(clonedSyncableDict, {
      objects: syncableObjectDict,
      context,
      ...options,
    });

    let updateDict: Dict<ChangePlantProcessingResultUpdateItem> = {};
    let creations: Syncable[] | undefined;
    let removals: SyncableRef[] | undefined;

    if (result) {
      for (let key of keys) {
        let latestSyncable = syncableDict[key];
        let updatedSyncableClone = clonedSyncableDict[key];

        let diffs = DeepDiff.diff(latestSyncable, updatedSyncableClone);

        if (!diffs.length) {
          continue;
        }

        let requireWriteRight = false;

        for (let diff of diffs) {
          let propertyName = diff.path[0];

          if (/^[^$]/.test(type)) {
            if (/^_/.test(propertyName)) {
              throw new Error(
                `Invalid operation, use built-in change for built-in property \`${propertyName}\``,
              );
            }
          } else {
            requireWriteRight = true;
          }
        }

        if (requireWriteRight) {
          syncableObjectDict[key].validateAccessRights(['write'], context);
        }

        updateDict[key] = {diffs, snapshot: updatedSyncableClone};
      }

      creations = result.creations;

      removals =
        result.removals &&
        result.removals.map(key => {
          let object = syncableObjectDict[key];

          object.validateAccessRights(['delete'], context);

          return object.ref;
        });
    }

    return {
      updates: updateDict,
      creations: creations || [],
      removals: removals || [],
    };
  }
}
