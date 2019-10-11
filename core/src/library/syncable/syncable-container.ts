import _ from 'lodash';
import {ObservableMap, action, observable} from 'mobx';
import {Dict, KeyOfValueWithType} from 'tslang';

import {ISyncable, SyncableId, SyncableRef} from './syncable';
import {ISyncableAdapter} from './syncable-adapter';
import {ISyncableObject} from './syncable-object';

type RefDictToSyncableDict<TRefDict extends object> = {
  [TName in keyof TRefDict]: TRefDict[TName] extends ISyncableObject
    ? TRefDict[TName]['syncable']
    : TRefDict[TName] extends ISyncableObject[]
    ? TRefDict[TName][number]['syncable']
    : never;
};

export type RefDictToSyncableObjectDict<T extends object> = T extends object
  ? {
      [TName in KeyOfValueWithType<Required<T>, SyncableRef>]: NonNullable<
        T[TName]
      > extends SyncableRef<infer TSyncableObject>
        ? TSyncableObject | (undefined extends T[TName] ? undefined : never)
        : never;
    } &
      {
        [TName in KeyOfValueWithType<Required<T>, SyncableRef[]>]: NonNullable<
          T[TName]
        > extends SyncableRef<infer TSyncableObject>[]
          ? TSyncableObject[] | (undefined extends T[TName] ? undefined : never)
          : never;
      }
  : never;

export class SyncableContainer<
  TSyncableObject extends ISyncableObject = ISyncableObject
> {
  private typeToIdToSyncableMapMap = observable.map<
    string,
    ObservableMap<SyncableId, ISyncable>
  >();

  private typeToIdToSyncableObjectMapMap = observable.map<
    string,
    ObservableMap<SyncableId, ISyncableObject>
  >();

  constructor(readonly adapter: ISyncableAdapter) {}

  buildSyncableDict<TRefDict extends object>(
    refDict: TRefDict,
  ): RefDictToSyncableDict<TRefDict>;
  buildSyncableDict(
    refDict: Dict<SyncableRef | SyncableRef[]>,
  ): Dict<ISyncable | ISyncable[]> {
    return _.mapValues(refDict, ref =>
      Array.isArray(ref)
        ? ref.map(ref => this.requireSyncable(ref as TSyncableObject['ref']))
        : this.requireSyncable(ref as TSyncableObject['ref']),
    ) as RefDictToSyncableDict<typeof refDict>;
  }

  buildSyncableObjectDict<TRefDict extends object>(
    refDict: TRefDict,
  ): RefDictToSyncableObjectDict<TRefDict>;
  buildSyncableObjectDict(
    refDict: Dict<SyncableRef | SyncableRef[]>,
  ): RefDictToSyncableObjectDict<Dict<SyncableRef>> {
    return _.mapValues(refDict, ref =>
      Array.isArray(ref)
        ? ref.map(ref =>
            this.requireSyncableObject(ref as TSyncableObject['ref']),
          )
        : this.requireSyncableObject(ref as TSyncableObject['ref']),
    ) as RefDictToSyncableObjectDict<typeof refDict>;
  }

  getSyncables<TType extends TSyncableObject['syncable']['_type']>(
    type?: TType,
  ): Extract<TSyncableObject['syncable'], {_type: TType}>[];
  getSyncables(type?: string): ISyncable[] {
    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;

    if (type) {
      let syncableMap = typeToIdToSyncableMapMap.get(type);

      if (!syncableMap) {
        return [];
      }

      return Array.from(syncableMap.values());
    } else {
      return _.flatten(
        Array.from(typeToIdToSyncableMapMap.values()).map(map =>
          Array.from(map.values()),
        ),
      );
    }
  }

  getSyncable<TRef extends TSyncableObject['ref']>({
    type,
    id,
  }: TRef): Extract<TSyncableObject, {ref: TRef}>['syncable'] | undefined {
    let syncableMap = this.typeToIdToSyncableMapMap.get(type);
    return syncableMap && syncableMap.get(id);
  }

  requireSyncable<TRef extends TSyncableObject['ref']>(
    ref: TRef,
  ): Extract<TSyncableObject, {ref: TRef}>['syncable'] {
    let syncable = this.getSyncable(ref);

    if (!syncable) {
      throw new Error(`Syncable "${JSON.stringify(ref)}" not added to context`);
    }

    return syncable;
  }

  existsSyncable({type, id}: SyncableRef<TSyncableObject>): boolean {
    let syncableMap = this.typeToIdToSyncableMapMap.get(type);
    return !!syncableMap && syncableMap.has(id);
  }

  getSyncableObjects<TType extends TSyncableObject['syncable']['_type']>(
    type?: TType,
  ): Extract<TSyncableObject, {syncable: {_type: TType}}>[];
  getSyncableObjects(type?: string): ISyncableObject[] {
    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;

    if (type) {
      let syncableMap = typeToIdToSyncableMapMap.get(type);

      if (!syncableMap) {
        return [];
      }

      return Array.from(syncableMap.keys()).map(id =>
        this.requireSyncableObject({type, id}),
      );
    } else {
      return _.flatten(
        Array.from(typeToIdToSyncableMapMap).map(([type, map]) =>
          Array.from(map.keys()).map(id =>
            this.requireSyncableObject({type, id}),
          ),
        ),
      );
    }
  }

  getSyncableObject<TRef extends TSyncableObject['ref']>(
    ref: TRef,
  ): Extract<TSyncableObject, {ref: TRef}> | undefined;
  getSyncableObject(ref: SyncableRef): ISyncableObject | undefined {
    let {type, id} = ref;

    let typeToIdToSyncableObjectMapMap = this.typeToIdToSyncableObjectMapMap;

    let syncableObjectMap = typeToIdToSyncableObjectMapMap.get(type);

    let object: ISyncableObject | undefined;

    if (syncableObjectMap) {
      object = syncableObjectMap.get(id);

      if (object) {
        return object;
      }
    } else {
      syncableObjectMap = observable.map([], {deep: false});
      typeToIdToSyncableObjectMapMap.set(type, syncableObjectMap);
    }

    object = this.adapter.instantiateByRef(ref, this);

    if (!object) {
      return undefined;
    }

    syncableObjectMap.set(id, object);

    return object;
  }

  requireSyncableObject<TRef extends TSyncableObject['ref']>(
    ref: TRef,
  ): Extract<TSyncableObject, {ref: TRef}> {
    let object = this.getSyncableObject(ref);

    if (!object) {
      throw new Error(`Syncable "${JSON.stringify(ref)}" not added to context`);
    }

    return object;
  }

  /**
   * Add a syncable, please notice that it won't change the reference of the
   * originally stored syncable. Instead, differences will be applied to it.
   */
  @action
  addSyncable(snapshot: ISyncable, clock?: number): void {
    snapshot = _.cloneDeep(snapshot);

    let {_id: id, _type: type} = snapshot;

    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;
    let syncableMap = typeToIdToSyncableMapMap.get(type);

    if (!syncableMap) {
      syncableMap = observable.map([], {deep: false});
      typeToIdToSyncableMapMap.set(type, syncableMap);
    }

    let syncable = syncableMap.get(id);

    if (syncable) {
      if (clock === undefined || clock > syncable._clock) {
        syncableMap.set(id, snapshot);
      }
    } else {
      syncableMap.set(id, snapshot);
    }
  }

  @action
  updateMatchingSyncable(snapshot: ISyncable, clock?: number): void {
    snapshot = _.cloneDeep(snapshot);

    let {_id: id, _type: type} = snapshot;

    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;
    let syncableMap = typeToIdToSyncableMapMap.get(type);

    if (!syncableMap) {
      return;
    }

    let syncable = syncableMap.get(id);

    if (syncable) {
      if (clock === undefined || clock > syncable._clock) {
        syncableMap.set(id, snapshot);
      }
    }
  }

  @action
  removeSyncable({type, id}: SyncableRef): void {
    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;
    let typeToIdToSyncableObjectMapMap = this.typeToIdToSyncableObjectMapMap;

    let syncableMap = typeToIdToSyncableMapMap.get(type);

    let syncable = syncableMap && syncableMap.get(id);

    if (!syncable) {
      return;
    }

    syncableMap!.delete(id);

    let syncableObjectMap = typeToIdToSyncableObjectMapMap.get(type);

    if (syncableObjectMap) {
      syncableObjectMap.delete(id);
    }
  }

  @action
  clear(): void {
    clearMapOrSetMap(this.typeToIdToSyncableMapMap);
    clearMapOrSetMap(this.typeToIdToSyncableObjectMapMap);

    function clearMapOrSetMap(
      mapMap: Map<any, Map<any, any> | Set<any>>,
    ): void {
      for (let map of Array.from(mapMap.values())) {
        map.clear();
      }
    }
  }
}
