import {Delta} from 'jsondiffpatch';
import _ from 'lodash';
import {Dict, KeyOfValueWithType} from 'tslang';

import {IContext} from '../context';
import {diff} from '../diff-patcher';
import {
  AccessRight,
  ISyncable,
  ISyncableObject,
  RefDictToSyncableObjectDict,
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

export type RefDictToSyncableOrCreationRefDict<
  T extends object
> = T extends object
  ? {
      [TName in KeyOfValueWithType<Required<T>, SyncableRef>]: NonNullable<
        T[TName]
      > extends SyncableRef<infer TSyncableObject>
        ?
            | TSyncableObject['syncable']
            | (undefined extends T[TName] ? undefined : never)
        : never;
    } &
      {
        [TName in KeyOfValueWithType<Required<T>, SyncableRef[]>]: NonNullable<
          T[TName]
        > extends SyncableRef<infer TSyncableObject>[]
          ?
              | TSyncableObject['syncable'][]
              | (undefined extends T[TName] ? undefined : never)
          : never;
      } &
      {
        [TName in KeyOfValueWithType<
          Required<T>,
          SyncableCreationRef
        >]: T[TName];
      }
  : never;

type ChangeToSyncableObjectRefDict<
  T extends IChange
> = RefDictToSyncableObjectDict<T['refs']>;

type ChangeToSyncableOrCreationRefDict<
  T extends IChange
> = RefDictToSyncableOrCreationRefDict<T['refs']>;

export interface ChangePlantProcessingResultUpdateItem {
  delta: Delta;
  snapshot: ISyncable;
}

export interface ChangePlantProcessingResult {
  id: ChangePacketId;
  creations: ISyncable[];
  updates: ChangePlantProcessingResultUpdateItem[];
  removals: SyncableRef[];
  notifications: unknown[];
  changes: GeneralChange[];
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

export type ChangePlantProcessorAbortOperation = () => void;

export type ChangePlantProcessorChangeOperation<TChange = GeneralChange> = (
  change: TChange,
) => void;

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
  TGenericParams extends IChangePlantBlueprintGenericParams = GeneralChangePlantBlueprintGenericParams,
  TSpecificChange extends IChange = TGenericParams['change']
> {
  context: TGenericParams['context'];
  container: SyncableContainer<TGenericParams['syncableObject']>;
  type: TSpecificChange['type'];
  refs: TSpecificChange['refs'];
  options: TSpecificChange['options'];
  create: ChangePlantProcessorCreateOperation;
  remove: ChangePlantProcessorRemoveOperation;
  isBeingRemoved: ChangePlantProcessorIsBeingRemovedTest;
  prepare: ChangePlantProcessorPrepareOperation;
  abort: ChangePlantProcessorAbortOperation;
  change: ChangePlantProcessorChangeOperation<TGenericParams['change']>;
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
  TGenericParams extends IChangePlantBlueprintGenericParams = GeneralChangePlantBlueprintGenericParams,
  TSpecificChange extends TGenericParams['change'] = TGenericParams['change']
> = (
  syncables: ChangeToSyncableOrCreationRefDict<TSpecificChange>,
  objects: ChangeToSyncableObjectRefDict<TSpecificChange>,
  extra: ChangePlantProcessorExtra<TGenericParams, TSpecificChange>,
) => void;

type ChangePlantSpecificProcessor<
  TGenericParams extends IChangePlantBlueprintGenericParams,
  TType extends string
> = ChangePlantProcessor<
  {
    context: TGenericParams['context'];
    syncableObject: TGenericParams['syncableObject'];
    change: TGenericParams['change'];
    notification: TGenericParams['notification'];
  },
  Extract<TGenericParams['change'], {type: TType}>
>;

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
    | ChangePlantSpecificProcessorOptions<TGenericParams, TType>;
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
      syncables.map((syncable): [string, ISyncable] => [
        getSyncableKey(syncable),
        syncable,
      ]),
    );

    let syncableDict: Dict<ISyncable | ISyncable[]> = {};

    for (let [name, ref] of Object.entries(refDict)) {
      if (!ref) {
        continue;
      }

      if (Array.isArray(ref)) {
        syncableDict[name] = ref.map(
          ref => syncableMap.get(getSyncableKey(ref))!,
        );
      } else {
        syncableDict[name] = syncableMap.get(getSyncableKey(ref))!;
      }
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
    let changes: GeneralChange[] = [];

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
      ISyncable | ISyncable[] | SyncableCreationRef
    > = {};
    let syncableObjectDict: Dict<ISyncableObject | ISyncableObject[]> = {};

    for (let [name, ref] of Object.entries(refDict)) {
      if (!ref) {
        continue;
      }

      if ('id' in ref) {
        let object = container.requireSyncableObject(ref);

        clonedSyncableOrCreationRefDict[name] = prepare(object);
        syncableObjectDict[name] = object;
      } else if (Array.isArray(ref)) {
        let objects = ref.map(ref => container.requireSyncableObject(ref));

        clonedSyncableOrCreationRefDict[name] = objects.map(object =>
          prepare(object),
        );
        syncableObjectDict[name] = objects;
      } else {
        clonedSyncableOrCreationRefDict[name] = ref;
      }
    }

    let processor = this.blueprint[type];

    if (typeof processor === 'object') {
      processor = processor.processor;
    }

    let aborted = false;

    let abort: ChangePlantProcessorAbortOperation = () => {
      aborted = true;
    };

    let change: ChangePlantProcessorChangeOperation = subsequentChange => {
      changes.push(subsequentChange);
    };

    processor(clonedSyncableOrCreationRefDict, syncableObjectDict, {
      context,
      container,
      create,
      remove,
      isBeingRemoved,
      prepare,
      notify,
      abort,
      change,
      type,
      options,
      refs: refDict,
      createdAt: now,
    });

    if (aborted) {
      return {
        id,
        updates: [],
        creations: [],
        removals: [],
        notifications,
        changes,
      };
    }

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

      let delta = diff(latestSyncable, updatedSyncableClone) || {};

      let changedFieldNameSet = new Set(Object.keys(delta));

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
          Array.from(changedFieldNameSet),
        );
      }

      updates.push({delta, snapshot: updatedSyncableClone});
    }

    return {
      id,
      clock,
      updates,
      creations: creations || [],
      removals: removals || [],
      notifications,
      changes,
    };
  }
}
