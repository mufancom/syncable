import * as DeepDiff from 'deep-diff';
import _ from 'lodash';
import {Dict, KeyOfValueWithType} from 'tslang';

import {IContext} from '../context';
import {
  AccessRight,
  ISyncable,
  ISyncableObject,
  SyncableContainer,
  SyncableRef,
  getSyncableKey,
} from '../syncable';
import {NumericTimestamp} from '../types';

import {
  ChangePacket,
  ChangePacketId,
  GeneralChange,
  IChange,
  SyncableCreationRef,
} from './change';

type RefDictToSyncableObjectDict<T extends object> = T extends object
  ? {
      [TName in KeyOfValueWithType<Required<T>, SyncableRef>]: NonNullable<
        T[TName]
      > extends SyncableRef<infer TSyncableObject>
        ? TSyncableObject | (undefined extends T[TName] ? undefined : never)
        : never
    }
  : never;

type ChangeToSyncableObjectRefDict<
  T extends IChange
> = RefDictToSyncableObjectDict<T['refs']>;

type RefDictToSyncableOrCreationRefDict<T extends object> = T extends object
  ? {
      [TName in KeyOfValueWithType<Required<T>, SyncableRef>]: NonNullable<
        T[TName]
      > extends SyncableRef<infer TSyncableObject>
        ?
            | TSyncableObject['syncable']
            | (undefined extends T[TName] ? undefined : never)
        : never
    } &
      {
        [TName in KeyOfValueWithType<
          Required<T>,
          SyncableCreationRef
        >]: T[TName]
      }
  : never;

type ChangeToSyncableOrCreationRefDict<
  T extends IChange
> = RefDictToSyncableOrCreationRefDict<T['refs']>;

export interface ChangePlantProcessingResultUpdateItem {
  diffs: DeepDiff.Diff<ISyncable>[];
  snapshot: ISyncable;
}

export interface ChangePlantProcessingResult {
  id: ChangePacketId;
  creations: ISyncable[];
  updates: ChangePlantProcessingResultUpdateItem[];
  removals: SyncableRef[];
  notifications: unknown[];
}

export interface ChangePlantProcessingResultWithClock
  extends ChangePlantProcessingResult {
  clock: number;
}

export type ChangePlantProcessorCreateOperation = (creation: ISyncable) => void;

export type ChangePlantProcessorRemoveOperation = (
  object: ISyncableObject,
) => void;

export type ChangePlantProcessorIsBeingRemovedTest = (
  object: ISyncableObject,
) => boolean;

declare function __changePlantProcessorPrepareOperation<
  T extends ISyncableObject
>(object: T): T['syncable'];

// TODO (vilic):
// Directly writing `type ... = <T extends ISyncableObject>(...): ...` would
// lead to intellisense errors (TypeScript 3.2.4).
export type ChangePlantProcessorPrepareOperation = typeof __changePlantProcessorPrepareOperation;

export type ChangePlantProcessorNotifyOperation<TNotification = unknown> = (
  notification: TNotification,
) => void;

export interface ChangePlantProcessorExtra<
  TGenericParams extends IChangePlantBlueprintGenericParams = GeneralChangePlantBlueprintGenericParams
> {
  context: TGenericParams['context'];
  container: SyncableContainer<TGenericParams['syncableObject']>;
  options: TGenericParams['change']['options'];
  create: ChangePlantProcessorCreateOperation;
  remove: ChangePlantProcessorRemoveOperation;
  isBeingRemoved: ChangePlantProcessorIsBeingRemovedTest;
  prepare: ChangePlantProcessorPrepareOperation;
  notify: ChangePlantProcessorNotifyOperation<TGenericParams['notification']>;
  createdAt: NumericTimestamp;
}

export type ChangePlantResolver<
  TGenericParams extends IChangePlantBlueprintGenericParams = GeneralChangePlantBlueprintGenericParams
> = (
  syncables: ChangeToSyncableOrCreationRefDict<TGenericParams['change']>,
  options: TGenericParams['change']['options'],
) => SyncableRef<TGenericParams['syncableObject']>[];

type ChangePlantSpecificResolver<
  TGenericParams extends IChangePlantBlueprintGenericParams,
  TType extends string
> = ChangePlantResolver<{
  context: TGenericParams['context'];
  syncableObject: TGenericParams['syncableObject'];
  change: Extract<TGenericParams['change'], {type: TType}>;
  notification: TGenericParams['notification'];
}>;

export type ChangePlantProcessor<
  TGenericParams extends IChangePlantBlueprintGenericParams = GeneralChangePlantBlueprintGenericParams
> = (
  syncables: ChangeToSyncableOrCreationRefDict<TGenericParams['change']>,
  objects: ChangeToSyncableObjectRefDict<TGenericParams['change']>,
  extra: ChangePlantProcessorExtra<TGenericParams>,
) => void;

type ChangePlantSpecificProcessor<
  TGenericParams extends IChangePlantBlueprintGenericParams,
  TType extends string
> = ChangePlantProcessor<{
  context: TGenericParams['context'];
  syncableObject: TGenericParams['syncableObject'];
  change: Extract<TGenericParams['change'], {type: TType}>;
  notification: TGenericParams['notification'];
}>;

export interface ChangePlantProcessorOptions<
  TGenericParams extends IChangePlantBlueprintGenericParams = IChangePlantBlueprintGenericParams
> {
  processor: ChangePlantProcessor<TGenericParams>;
  resolver: ChangePlantResolver<TGenericParams>;
}

interface ChangePlantSpecificProcessorOptions<
  TGenericParams extends IChangePlantBlueprintGenericParams,
  TType extends string
> {
  processor: ChangePlantSpecificProcessor<TGenericParams, TType>;
  resolver: ChangePlantSpecificResolver<TGenericParams, TType>;
}

export type ChangePlantBlueprint<
  TGenericParams extends IChangePlantBlueprintGenericParams = GeneralChangePlantBlueprintGenericParams
> = {
  [TType in TGenericParams['change']['type']]:
    | ChangePlantSpecificProcessor<TGenericParams, TType>
    | ChangePlantSpecificProcessorOptions<TGenericParams, TType>
};

export interface IChangePlantBlueprintGenericParams {
  context: IContext;
  syncableObject: ISyncableObject;
  change: IChange;
  notification: unknown;
}

export interface GeneralChangePlantBlueprintGenericParams
  extends IChangePlantBlueprintGenericParams {
  change: GeneralChange;
}

export type ChangePlantResolveSyncableLoader = (
  refs: SyncableRef[],
) => Promise<ISyncable[]>;

export class ChangePlant {
  constructor(private blueprint: ChangePlantBlueprint) {}

  resolve(
    {type, refs: refDict, options}: ChangePacket,
    syncables: ISyncable[],
  ): SyncableRef[] {
    let processorOptions = this.blueprint[type];

    let resolver =
      typeof processorOptions === 'object'
        ? processorOptions.resolver
        : undefined;

    if (!resolver) {
      return [];
    }

    let syncableMap = new Map(
      syncables.map(
        (syncable): [string, ISyncable] => [getSyncableKey(syncable), syncable],
      ),
    );

    let syncableDict: Dict<ISyncable> = {};

    for (let [name, ref] of Object.entries(refDict)) {
      syncableDict[name] = syncableMap.get(getSyncableKey(ref))!;
    }

    return resolver(syncableDict, options);
  }

  process(
    packet: ChangePacket,
    context: IContext,
    container: SyncableContainer,
  ): ChangePlantProcessingResult;
  process(
    packet: ChangePacket,
    context: IContext,
    container: SyncableContainer,
    clock: number,
  ): ChangePlantProcessingResultWithClock;
  process(
    {id, type, refs: refDict, options, createdAt}: ChangePacket,
    context: IContext,
    container: SyncableContainer,
    clock?: number,
  ): ChangePlantProcessingResult | ChangePlantProcessingResultWithClock {
    let now =
      context.environment === 'client'
        ? createdAt
        : (Date.now() as NumericTimestamp);

    let preparedSyncableObjectMap = new Map<string, ISyncableObject>();
    let preparedSyncableObjectToSyncableMap = new Map<
      ISyncableObject,
      ISyncable
    >();

    interface PreparedBundle {
      latest: ISyncable;
      clone: ISyncable;
      object: ISyncableObject;
    }

    let preparedBundles: PreparedBundle[] = [];

    let creations: ISyncable[] = [];
    let removals: SyncableRef[] = [];
    let removalObjectSet = new Set<ISyncableObject>();
    let updates: ChangePlantProcessingResultUpdateItem[] = [];
    let notifications: unknown[] = [];

    let create: ChangePlantProcessorCreateOperation = creation => {
      if (clock !== undefined) {
        creation._clock = clock;
      }

      creation._createdAt = now;
      creation._updatedAt = now;

      creations.push(creation);
    };

    let remove: ChangePlantProcessorRemoveOperation = object => {
      object.validateAccessRights(['full'], context);
      removals.push(object.ref);
      removalObjectSet.add(object);
    };

    let isBeingRemoved: ChangePlantProcessorIsBeingRemovedTest = object => {
      return removalObjectSet.has(object);
    };

    let prepare: ChangePlantProcessorPrepareOperation = object => {
      let clone = preparedSyncableObjectToSyncableMap.get(object);

      if (clone) {
        return clone;
      }

      object.validateAccessRights(['read'], context);

      let latest = object.syncable;

      clone = _.cloneDeep(latest);

      preparedBundles.push({
        latest,
        clone,
        object,
      });

      let key = getSyncableKey(object.ref);

      preparedSyncableObjectMap.set(key, object);
      preparedSyncableObjectToSyncableMap.set(object, clone);

      return clone;
    };

    let notify: ChangePlantProcessorNotifyOperation = notification => {
      notifications.push(notification);
    };

    let clonedSyncableOrCreationRefDict: Dict<
      ISyncable | SyncableCreationRef
    > = {};
    let syncableObjectDict: Dict<ISyncableObject> = {};

    for (let [name, ref] of Object.entries(refDict)) {
      if (!ref) {
        continue;
      }

      if ('id' in ref) {
        let object = container.requireSyncableObject(ref);

        clonedSyncableOrCreationRefDict[name] = prepare(object);
        syncableObjectDict[name] = object;
      } else {
        clonedSyncableOrCreationRefDict[name] = ref;
      }
    }

    let processor = this.blueprint[type];

    if (typeof processor === 'object') {
      processor = processor.processor;
    }

    processor(clonedSyncableOrCreationRefDict, syncableObjectDict, {
      context,
      container,
      options,
      create,
      remove,
      isBeingRemoved,
      prepare,
      notify,
      createdAt: now,
    });

    for (let {
      latest: latestSyncable,
      clone: updatedSyncableClone,
      object: latestSyncableObject,
    } of preparedBundles) {
      if (removalObjectSet.has(latestSyncableObject)) {
        continue;
      }

      if (clock !== undefined) {
        updatedSyncableClone._clock = clock;
      }

      updatedSyncableClone._updatedAt = now;

      let diffs = DeepDiff.diff(latestSyncable, updatedSyncableClone) || [];

      let changedFieldNameSet = new Set(
        diffs.map(diff => diff.path && diff.path[0]),
      );

      changedFieldNameSet.delete('_clock');
      changedFieldNameSet.delete('_updatedAt');

      if (!changedFieldNameSet.size) {
        continue;
      }

      if (
        changedFieldNameSet.has('_id') ||
        changedFieldNameSet.has('_type') ||
        changedFieldNameSet.has('_extends')
      ) {
        throw new Error('Invalid operation');
      }

      let requiredRightSet = new Set<AccessRight>(['write']);

      let securingFieldNameSet = new Set(
        latestSyncableObject.getSecuringFieldNames(),
      );

      for (let fieldName of changedFieldNameSet) {
        if (/^_/.test(fieldName) || securingFieldNameSet.has(fieldName)) {
          requiredRightSet.add('full');
          break;
        }
      }

      if (requiredRightSet.size) {
        latestSyncableObject.validateAccessRights(
          Array.from(requiredRightSet),
          context,
        );
      }

      updates.push({diffs, snapshot: updatedSyncableClone});
    }

    return {
      id,
      clock,
      updates,
      creations: creations || [],
      removals: removals || [],
      notifications,
    };
  }
}
