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
  SyncableRef,
} from '../syncable';
import {NumericTimestamp} from '../types';

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
  notificationPacket: NotificationPacket | undefined;
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

export type NotificationPacket<
  TNotification extends INotification = INotification
> = TNotification & {id: ChangePacketId};

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
  ): ChangePlantProcessingResult;
  process(
    packet: ChangePacket,
    syncableObjectOrCreationRefDict: Dict<
      ISyncableObject | SyncableCreationRef | undefined
    >,
    context: Context,
    timestamp: number,
  ): ChangePlantProcessingResultWithTimestamp;
  process(
    {id, type, options, createdAt}: ChangePacket,
    syncableObjectOrCreationRefDict: Dict<
      ISyncableObject | SyncableCreationRef | undefined
    >,
    context: Context,
    timestamp?: number,
  ): ChangePlantProcessingResult | ChangePlantProcessingResultWithTimestamp {
    let now = context.environment === 'client' ? createdAt : Date.now();

    let processor = this.blueprint[type];

    let provider = this.provider;

    let syncableObjectEntries = Array.from(
      Object.entries(syncableObjectOrCreationRefDict),
    ).filter((entry): entry is [string, ISyncableObject] => {
      let [, object] = entry;
      return object instanceof AbstractSyncableObject;
    });

    let preparedSyncableObjectSet = new Set<ISyncableObject>();

    interface PreparedBundle {
      latest: ISyncable;
      clone: ISyncable;
      object: ISyncableObject;
    }

    let preparedBundles: PreparedBundle[] = [];

    let creations: ISyncable[] = [];
    let removals: SyncableRef[] = [];
    let updates: ChangePlantProcessingResultUpdateItem[] = [];
    let notificationPacket: NotificationPacket | undefined;

    let create: ChangePlantProcessorCreateOperation = creation => {
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
    };

    let prepare: ChangePlantProcessorPrepareOperation = object => {
      if (preparedSyncableObjectSet.has(object)) {
        throw new Error('Cannot prepare a syncable object twice');
      }

      preparedSyncableObjectSet.add(object);

      object.validateAccessRights(['read'], context);

      let latest = object.syncable;
      let clone = _.cloneDeep(latest);

      preparedBundles.push({
        latest,
        clone,
        object,
      });

      return clone;
    };

    let notify: ChangePlantProcessorNotifyOperation = notification => {
      notificationPacket = {
        id,
        ...notification,
      };
    };

    let clonedSyncableDict: Dict<ISyncable> = {};

    for (let [key, object] of syncableObjectEntries) {
      clonedSyncableDict[key] = prepare(object);
    }

    processor(clonedSyncableDict, syncableObjectOrCreationRefDict, {
      context,
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

      let requiredRightSet = new Set<AccessRight>();

      let latestAssociations = provider
        .resolveAssociations(latestSyncable)
        .filter(association => association.secures);
      let updatedAssociations = provider
        .resolveAssociations(updatedSyncableClone)
        .filter(association => association.secures);

      let securingAssociationChanged =
        _.xorBy(
          latestAssociations,
          updatedAssociations,
          ({ref: {type, id}}) => `${type}-${id}`,
        ).length > 0;

      if (securingAssociationChanged) {
        requiredRightSet.add('full');
      }

      for (let diff of diffs) {
        let propertyName = diff.path[0];

        if (
          propertyName === '_id' ||
          propertyName === '_type' ||
          propertyName === '_extends'
        ) {
          throw new Error('Invalid operation');
        }

        if (/^_(?!timestamp)$/.test(propertyName)) {
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
      notificationPacket,
    };
  }
}
