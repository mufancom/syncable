import * as DeepDiff from 'deep-diff';
import _ from 'lodash';
import {Dict, KeyOfValueWithType, ValueWithType} from 'tslang';

import {Context} from '../context';
import {
  Syncable,
  SyncableObject,
  SyncableRef,
  SyncableType,
  UserSyncableObject,
} from '../syncable';

import {builtInChangePlantBlueprint} from './built-in-changes';
import {
  Change,
  ChangePacket,
  ChangePacketUID,
  GeneralChange,
  SyncableCreationRef,
} from './change';

export type RefDictToObjectOrCreationRefDict<
  T extends object
> = T extends object
  ? {
      [K in KeyOfValueWithType<T, SyncableRef>]: T[K] extends SyncableRef<
        infer TSyncableObject
      >
        ? T[K] extends SyncableCreationRef<TSyncableObject>
          ? T[K]
          : TSyncableObject
        : never
    }
  : never;

export type ChangeToObjectOrCreationRefDict<
  T extends Change
> = T extends Change<string, infer TRefDict>
  ? RefDictToObjectOrCreationRefDict<TRefDict>
  : never;

export type RefDictToSyncableDict<T extends object> = T extends object
  ? {
      [K in KeyOfValueWithType<T, SyncableRef>]: T[K] extends SyncableRef<
        infer TSyncableObject
      >
        ? T[K] extends SyncableCreationRef<TSyncableObject>
          ? never
          : TSyncableObject['syncable']
        : never
    }
  : never;

export type ChangeToSyncableDict<T extends Change> = T extends Change<
  string,
  infer TRefDict
>
  ? RefDictToSyncableDict<TRefDict>
  : never;

export type RefDictToCreation<T extends object> = ValueWithType<
  T,
  SyncableCreationRef
>;

export type ChangeToCreation<T extends Change> = T extends Change<
  string,
  infer TRefDict
>
  ? SyncableType<ValueWithType<TRefDict, SyncableCreationRef>>
  : never;

export interface ChangePlantProcessorOutput<TChange extends Change> {
  creations?: ChangeToCreation<TChange>[];
  removals?: (keyof ChangeToSyncableDict<TChange>)[];
}

export interface ChangePlantProcessingResultUpdateItem {
  diffs: deepDiff.IDiff[];
  snapshot: Syncable;
}

export interface ChangePlantProcessingResult {
  uid: ChangePacketUID;
  updates: Dict<ChangePlantProcessingResultUpdateItem>;
  creations: Syncable[];
  removals: SyncableRef[];
}

export interface ChangePlantProcessingResultWithTimestamp
  extends ChangePlantProcessingResult {
  timestamp: number;
}

export interface ChangePlantProcessorOptions<
  TUser extends UserSyncableObject = UserSyncableObject,
  TChange extends Change = GeneralChange
> {
  context: Context<TUser>;
  options: TChange['options'];
}

export type ChangePlantProcessor<
  TUser extends UserSyncableObject = UserSyncableObject,
  TChange extends Change = GeneralChange
> = (
  syncables: ChangeToSyncableDict<TChange>,
  objects: ChangeToObjectOrCreationRefDict<TChange>,
  data: ChangePlantProcessorOptions<TUser, TChange>,
) => ChangePlantProcessorOutput<TChange> | void;

export type ChangePlantBlueprint<
  TUser extends UserSyncableObject,
  TChange extends Change
> = {
  [K in TChange['type']]: ChangePlantProcessor<
    TUser,
    Extract<TChange, {type: K}>
  >
};

export class ChangePlant<
  TUser extends UserSyncableObject = UserSyncableObject,
  TChange extends Change = GeneralChange
> {
  constructor(private blueprint: ChangePlantBlueprint<TUser, TChange>) {}

  process(
    packet: ChangePacket,
    syncableObjectOrCreationRefDict: Dict<SyncableObject | SyncableCreationRef>,
    context: Context<TUser>,
  ): ChangePlantProcessingResult;
  process(
    packet: ChangePacket,
    syncableObjectOrCreationRefDict: Dict<SyncableObject | SyncableCreationRef>,
    context: Context<TUser>,
    timestamp: number,
  ): ChangePlantProcessingResultWithTimestamp;
  process(
    {uid, type, options}: ChangePacket,
    syncableObjectOrCreationRefDict: Dict<SyncableObject | SyncableCreationRef>,
    context: Context,
    timestamp?: number,
  ): ChangePlantProcessingResult | ChangePlantProcessingResultWithTimestamp {
    let processor = ((builtInChangePlantBlueprint as any)[type] ||
      (this.blueprint as any)[type]) as ChangePlantProcessor<TUser, Change>;

    let syncableObjectEntries = Array.from(
      Object.entries(syncableObjectOrCreationRefDict),
    ).filter((entry: [string, SyncableObject | SyncableCreationRef]): entry is [
      string,
      SyncableObject
    ] => {
      let [, object] = entry;
      return object instanceof SyncableObject;
    });

    let syncableKeys = syncableObjectEntries.map(([key]) => key);

    let syncableDict = syncableObjectEntries.reduce(
      (dict, [name, object]) => {
        dict[name] = object.syncable;
        return dict;
      },
      {} as Dict<Syncable>,
    );

    let syncableObjectDict = syncableObjectEntries.reduce(
      (dict, [name, object]) => {
        dict[name] = object;
        return dict;
      },
      {} as Dict<SyncableObject>,
    );

    let clonedSyncableDict = _.mapValues(syncableDict, syncable =>
      _.cloneDeep(syncable),
    );

    let result =
      processor(
        clonedSyncableDict,
        syncableObjectOrCreationRefDict as ChangeToObjectOrCreationRefDict<
          GeneralChange
        >,
        {
          context,
          options,
        } as ChangePlantProcessorOptions<TUser, TChange>,
      ) || {};

    let updateDict: Dict<ChangePlantProcessingResultUpdateItem> = {};
    let creations: Syncable[] | undefined;
    let removals: SyncableRef[] | undefined;

    for (let key of syncableKeys) {
      let latestSyncable = syncableDict[key];
      let updatedSyncableClone = clonedSyncableDict[key];

      if (timestamp !== undefined) {
        updatedSyncableClone._timestamp = timestamp;
      }

      let diffs = DeepDiff.diff(latestSyncable, updatedSyncableClone);

      if (
        !diffs ||
        !diffs.length ||
        (diffs.length === 1 && diffs[0].path[0] === '_timestamp')
      ) {
        continue;
      }

      let requireWriteRight = false;

      for (let diff of diffs) {
        let propertyName = diff.path[0];

        if (/^[^$]/.test(type)) {
          if (/^_(?!timestamp)$/.test(propertyName)) {
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

    creations = result.creations || [];

    if (timestamp !== undefined) {
      for (let creation of creations) {
        creation._timestamp = timestamp;
      }
    }

    removals = result.removals
      ? result.removals.map(key => {
          let object = syncableObjectDict[key];

          object.validateAccessRights(['full'], context);

          return object.ref;
        })
      : [];

    return {
      uid,
      timestamp,
      updates: updateDict,
      creations: creations || [],
      removals: removals || [],
    };
  }
}
