import * as DeepDiff from 'deep-diff';
import _ from 'lodash';
import {Dict, KeyOfValueWithType, ValueWithType} from 'tslang';

import {AccessRight} from '../access-control';
import {Context, ISyncableObjectProvider} from '../context';
import {
  AbstractSyncableObject,
  ISyncable,
  ISyncableObject,
  IUserSyncableObject,
  SyncableManager,
  SyncableRef,
} from '../syncable';
import {NumericTimestamp} from '../types';
import {getSyncableKey} from '../utils';

import {
  ChangePacket,
  ChangePacketId,
  GeneralChange,
  IChange,
  SyncableCreationRef,
} from './change';

export type RefDictToObjectOrCreationRefDict<
  T extends object
> = T extends object
  ? {
      [K in KeyOfValueWithType<Required<T>, SyncableRef>]: NonNullable<
        T[K]
      > extends SyncableRef<infer TSyncableObject>
        ?
            | (NonNullable<T[K]> extends SyncableCreationRef<TSyncableObject>
                ? T[K]
                : TSyncableObject)
            | (undefined extends T[K] ? undefined : never)
        : never
    }
  : never;

export type ChangeToObjectOrCreationRefDict<
  T extends IChange
> = T extends IChange<string, infer TRefDict>
  ? RefDictToObjectOrCreationRefDict<TRefDict>
  : never;

export type RefDictToSyncableDict<T extends object> = T extends object
  ? {
      [K in KeyOfValueWithType<Required<T>, SyncableRef>]: NonNullable<
        T[K]
      > extends SyncableRef<infer TSyncableObject>
        ? NonNullable<T[K]> extends SyncableCreationRef<TSyncableObject>
          ? never
          :
              | TSyncableObject['syncable']
              | (undefined extends T[K] ? undefined : never)
        : never
    }
  : never;

export type ChangeToSyncableDict<T extends IChange> = T extends IChange<
  string,
  infer TRefDict
>
  ? RefDictToSyncableDict<TRefDict>
  : never;

export type ChangeToSyncable<T extends IChange> = T extends IChange<
  string,
  infer TRefDict
>
  ? NonNullable<ValueWithType<RefDictToSyncableDict<TRefDict>, any>>
  : never;

export type RefDictToCreation<T extends object> = ValueWithType<
  T,
  SyncableCreationRef
>;

export interface ChangePlantProcessingResultUpdateItem {
  diffs: deepDiff.IDiff[];
  snapshot: ISyncable;
}

export interface ChangePlantProcessingResult {
  id: ChangePacketId;
  updates: ChangePlantProcessingResultUpdateItem[];
  creations: ISyncable[];
  removals: SyncableRef[];
  notifications: INotification[];
}

export interface ChangePlantProcessingResultWithTimestamp
  extends ChangePlantProcessingResult {
  timestamp: number;
}

export type ChangePlantProcessorCreateOperation = (creation: ISyncable) => void;

export type ChangePlantProcessorRemoveOperation = (
  object: ISyncableObject,
) => void;

export type ChangePlantProcessorPrepareOperation = <T extends ISyncableObject>(
  object: T,
) => T['syncable'];

export interface INotification {
  type: string;
}

export type ChangePlantProcessorNotifyOperation<
  TNotification extends INotification = INotification
> = (notification: TNotification) => void;

export interface ChangePlantProcessorExtraGenericParams {
  user: IUserSyncableObject;
  change: IChange;
  notification: INotification;
}

export interface DefaultChangePlantProcessorExtraGenericParams
  extends ChangePlantProcessorExtraGenericParams {
  change: GeneralChange;
}

export interface ChangePlantProcessorExtra<
  TGenericParams extends ChangePlantProcessorExtraGenericParams = DefaultChangePlantProcessorExtraGenericParams
> {
  context: Context<TGenericParams['user']>;
  manager: SyncableManager;
  options: TGenericParams['change']['options'];
  create: ChangePlantProcessorCreateOperation;
  remove: ChangePlantProcessorRemoveOperation;
  prepare: ChangePlantProcessorPrepareOperation;
  notify: ChangePlantProcessorNotifyOperation<TGenericParams['notification']>;
  createdAt: NumericTimestamp;
}

export interface ChangePlantProcessorGenericParams {
  user: IUserSyncableObject;
  change: IChange;
  notification: INotification;
}

export interface DefaultChangePlantProcessorGenericParams
  extends ChangePlantProcessorGenericParams {
  change: GeneralChange;
}

export type ChangePlantProcessor<
  TGenericParams extends ChangePlantProcessorGenericParams = DefaultChangePlantProcessorGenericParams
> = (
  syncables: ChangeToSyncableDict<TGenericParams['change']>,
  objects: ChangeToObjectOrCreationRefDict<TGenericParams['change']>,
  data: ChangePlantProcessorExtra<TGenericParams>,
) => void;

export interface ChangePlantBlueprintGenericParams {
  user: IUserSyncableObject;
  change: IChange;
  notification: INotification;
}

export type ChangePlantBlueprint<
  TGenericParams extends ChangePlantBlueprintGenericParams = ChangePlantBlueprintGenericParams
> = {
  [K in TGenericParams['change']['type']]: ChangePlantProcessor<{
    user: TGenericParams['user'];
    change: Extract<TGenericParams['change'], {type: K}>;
    notification: TGenericParams['notification'];
  }>
};

export interface ChangePlantGenericParams {
  user: IUserSyncableObject;
  change: IChange;
  notification: INotification;
}

export class ChangePlant {
  constructor(
    private blueprint: ChangePlantBlueprint,
    private provider: ISyncableObjectProvider,
  ) {}

  process(
    packet: ChangePacket,
    syncableObjectOrCreationRefDict: Dict<
      ISyncableObject | SyncableCreationRef | undefined
    >,
    context: Context,
    manager: SyncableManager,
  ): ChangePlantProcessingResult;
  process(
    packet: ChangePacket,
    syncableObjectOrCreationRefDict: Dict<
      ISyncableObject | SyncableCreationRef | undefined
    >,
    context: Context,
    manager: SyncableManager,
    timestamp: number,
  ): ChangePlantProcessingResultWithTimestamp;
  process(
    {id, type, options, createdAt}: ChangePacket,
    syncableObjectOrCreationRefDict: Dict<
      ISyncableObject | SyncableCreationRef | undefined
    >,
    context: Context,
    manager: SyncableManager,
    timestamp?: number,
  ): ChangePlantProcessingResult | ChangePlantProcessingResultWithTimestamp {
    let now = context.environment === 'client' ? createdAt : Date.now();

    let processor = this.blueprint[type];

    let provider = this.provider;

    let syncableObjectEntries = Array.from(
      Object.entries(syncableObjectOrCreationRefDict),
    ).filter(
      (entry): entry is [string, ISyncableObject] => {
        let [, object] = entry;
        return object instanceof AbstractSyncableObject;
      },
    );

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
    let notifications: INotification[] = [];

    let create: ChangePlantProcessorCreateOperation = creation => {
      let {_extends} = creation;

      if (_extends) {
        let superKey = getSyncableKey(_extends.ref);
        let superObject = preparedSyncableObjectMap.get(superKey);

        if (!superObject) {
          throw new Error(
            'A super object (`extends`) must be prepared (either in ref dict or using `prepare`), using a ref directly is not allowed',
          );
        }
      }

      if (timestamp !== undefined) {
        creation._timestamp = timestamp;
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

    let clonedSyncableDict: Dict<ISyncable> = {};

    for (let [key, object] of syncableObjectEntries) {
      clonedSyncableDict[key] = prepare(object);
    }

    processor(clonedSyncableDict, syncableObjectOrCreationRefDict, {
      context,
      manager,
      options,
      create,
      remove,
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

      if (timestamp !== undefined) {
        updatedSyncableClone._timestamp = timestamp;
      }

      updatedSyncableClone._updatedAt = now;

      let diffs = DeepDiff.diff(latestSyncable, updatedSyncableClone);

      if (
        !diffs ||
        !diffs.length ||
        (diffs.length === 1 && diffs[0].path[0] === '_timestamp')
      ) {
        continue;
      }

      let securingFieldNameSet = new Set(
        latestSyncableObject.getSecuringFieldNames(),
      );

      let requiredRightSet = new Set<AccessRight>();

      let latestAssociations = provider
        .resolveAssociations(latestSyncable)
        .filter(association => association.secures);
      let updatedAssociations = provider
        .resolveAssociations(updatedSyncableClone)
        .filter(association => association.secures);

      let securingAssociationChanged =
        _.xorBy(latestAssociations, updatedAssociations, association =>
          getSyncableKey(association.ref),
        ).length > 0;

      if (securingAssociationChanged) {
        requiredRightSet.add('full');
      }

      for (let diff of diffs) {
        let fieldName = diff.path[0];

        if (
          fieldName === '_id' ||
          fieldName === '_type' ||
          fieldName === '_extends'
        ) {
          throw new Error('Invalid operation');
        }

        if (
          /^_(?!timestamp)$/.test(fieldName) ||
          securingFieldNameSet.has(fieldName)
        ) {
          requiredRightSet.add('full');
        } else {
          requiredRightSet.add('write');
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
      timestamp,
      updates,
      creations: creations || [],
      removals: removals || [],
      notifications,
    };
  }
}
