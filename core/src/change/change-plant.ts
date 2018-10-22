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
  SyncableId,
  SyncableNotification,
  SyncableNotificationId,
  SyncableRef,
  SyncableType,
} from '../syncable';

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
  T extends IChange
> = T extends IChange<string, infer TRefDict>
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
  ? ValueWithType<RefDictToSyncableDict<TRefDict>, any>
  : never;

export type RefDictToCreation<T extends object> = ValueWithType<
  T,
  SyncableCreationRef
>;

export type ChangeToCreation<T extends IChange> = T extends IChange<
  string,
  infer TRefDict
>
  ? SyncableType<ValueWithType<TRefDict, SyncableCreationRef>>
  : never;

export interface ChangePlantProcessingResultUpdateItem {
  diffs: deepDiff.IDiff[];
  snapshot: ISyncable;
}

export interface ChangePlantProcessingResult {
  id: ChangePacketId;
  updates: Dict<ChangePlantProcessingResultUpdateItem>;
  creations: ISyncable[];
  removals: SyncableRef[];
  notification: SyncableNotification | undefined;
}

export interface ChangePlantProcessingResultWithTimestamp
  extends ChangePlantProcessingResult {
  timestamp: number;
}

export type ChangePlantProcessorCreateOperation<TChange extends IChange> = (
  creation: ChangeToCreation<TChange>,
) => void;

export type ChangePlantProcessorRemoveOperation<TChange extends IChange> = (
  removal:
    | Extract<keyof ChangeToSyncableDict<TChange>, string>
    | ChangeToSyncable<TChange>,
) => void;

export type ChangePlantProcessorNotifyOperation = (
  notificationMessage: string,
) => void;

export interface ChangePlantProcessorExtra<
  TUser extends IUserSyncableObject = IUserSyncableObject,
  TChange extends IChange = GeneralChange
> {
  context: Context<TUser>;
  options: TChange['options'];
  create: ChangePlantProcessorCreateOperation<TChange>;
  remove: ChangePlantProcessorRemoveOperation<TChange>;
  notify: ChangePlantProcessorNotifyOperation;
}

export type ChangePlantProcessor<
  TUser extends IUserSyncableObject = IUserSyncableObject,
  TChange extends IChange = GeneralChange
> = (
  syncables: ChangeToSyncableDict<TChange>,
  objects: ChangeToObjectOrCreationRefDict<TChange>,
  data: ChangePlantProcessorExtra<TUser, TChange>,
) => void;

export type ChangePlantBlueprint<
  TUser extends IUserSyncableObject,
  TChange extends IChange
> = {
  [K in TChange['type']]: ChangePlantProcessor<
    TUser,
    Extract<TChange, {type: K}>
  >
};

export class ChangePlant<
  TUser extends IUserSyncableObject = IUserSyncableObject,
  TChange extends IChange = GeneralChange
> {
  constructor(
    private blueprint: ChangePlantBlueprint<TUser, TChange>,
    private provider: ISyncableObjectProvider,
  ) {}

  process(
    packet: ChangePacket,
    syncableObjectOrCreationRefDict: Dict<
      ISyncableObject | SyncableCreationRef
    >,
    context: Context<TUser>,
  ): ChangePlantProcessingResult;
  process(
    packet: ChangePacket,
    syncableObjectOrCreationRefDict: Dict<
      ISyncableObject | SyncableCreationRef
    >,
    context: Context<TUser>,
    timestamp: number,
  ): ChangePlantProcessingResultWithTimestamp;
  process(
    {id, type, options}: ChangePacket,
    syncableObjectOrCreationRefDict: Dict<
      ISyncableObject | SyncableCreationRef
    >,
    context: Context,
    timestamp?: number,
  ): ChangePlantProcessingResult | ChangePlantProcessingResultWithTimestamp {
    let processor = (this.blueprint as any)[type] as ChangePlantProcessor<
      TUser,
      IChange
    >;

    let provider = this.provider;

    let syncableObjectEntries = Array.from(
      Object.entries(syncableObjectOrCreationRefDict),
    ).filter(
      (
        entry: [string, ISyncableObject | SyncableCreationRef],
      ): entry is [string, ISyncableObject] => {
        let [, object] = entry;
        return object instanceof AbstractSyncableObject;
      },
    );

    let syncableKeys = syncableObjectEntries.map(([key]) => key);

    let syncableDict = syncableObjectEntries.reduce(
      (dict, [name, object]) => {
        dict[name] = object.syncable;
        return dict;
      },
      {} as Dict<ISyncable>,
    );

    let syncableObjectMap = new Map<SyncableId, ISyncableObject>();

    let syncableObjectDict = syncableObjectEntries.reduce(
      (dict, [name, object]) => {
        syncableObjectMap.set(object.syncable._id, object);

        dict[name] = object;

        return dict;
      },
      {} as Dict<ISyncableObject>,
    );

    let clonedSyncableDict = _.mapValues(syncableDict, syncable =>
      _.cloneDeep(syncable),
    );

    let creations: ISyncable[] = [];
    let removals: SyncableRef[] = [];
    let notification: SyncableNotification | undefined = undefined;

    let create: ChangePlantProcessorCreateOperation<
      GeneralChange
    > = creation => {
      let _creation = creation as ISyncable;

      if (timestamp !== undefined) {
        _creation._timestamp = timestamp;
      }

      creations.push(_creation);
    };

    let remove: ChangePlantProcessorRemoveOperation<
      GeneralChange
    > = removal => {
      let object;

      if (typeof removal === 'string') {
        object = syncableObjectDict[removal];
      } else {
        object = syncableObjectMap.get(removal._id)!;
      }

      object.validateAccessRights(['full'], context);

      removals.push(object.ref);
    };

    let notify: ChangePlantProcessorNotifyOperation = notificationMessage => {
      notification = {
        id: (id as string) as SyncableNotificationId,
        message: notificationMessage,
      };
    };

    processor(
      clonedSyncableDict,
      syncableObjectOrCreationRefDict as ChangeToObjectOrCreationRefDict<
        GeneralChange
      >,
      {
        context,
        options,
        create: create as ChangePlantProcessorCreateOperation<TChange>,
        remove: remove as ChangePlantProcessorRemoveOperation<TChange>,
        notify: notify as ChangePlantProcessorNotifyOperation,
      } as ChangePlantProcessorExtra<TUser, TChange>,
    );

    let updateDict: Dict<ChangePlantProcessingResultUpdateItem> = {};

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

      let requiredRightSet = new Set<AccessRight>();

      let latestAssociations = provider
        .resolveAssociations(latestSyncable)
        .filter(association => association.secures);
      let updatedAssociations = provider
        .resolveAssociations(updatedSyncableClone)
        .filter(association => association.secures);

      let securingAssociationChanged = !!_.xorBy(
        latestAssociations,
        updatedAssociations,
        ({ref: {type, id}}) => `${type}-${id}`,
      ).length;

      if (securingAssociationChanged) {
        requiredRightSet.add('full');
      }

      for (let diff of diffs) {
        let propertyName = diff.path[0];

        if (propertyName === '_id' || propertyName === '_type') {
          throw new Error('Invalid operation');
        }

        if (/^_(?!timestamp)$/.test(propertyName)) {
          requiredRightSet.add('full');
        } else {
          requiredRightSet.add('write');
        }
      }

      if (requiredRightSet.size) {
        syncableObjectDict[key].validateAccessRights(
          Array.from(requiredRightSet),
          context,
        );
      }

      updateDict[key] = {diffs, snapshot: updatedSyncableClone};
    }

    return {
      id,
      timestamp,
      updates: updateDict,
      creations: creations || [],
      removals: removals || [],
      notification,
    };
  }
}
