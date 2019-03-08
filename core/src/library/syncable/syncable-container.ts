import _ from 'lodash';
import {ObservableMap, action, observable} from 'mobx';
import replaceObject from 'replace-object';
import {Dict, KeyOfValueWithType} from 'tslang';

import {SyncableCreationRef} from '../change';

import {ISyncable, SyncableId, SyncableRef} from './syncable';
import {ISyncableAdapter} from './syncable-adapter';
import {ISyncableObject} from './syncable-object';

type RefDictToSyncableDict<TRefDict extends object> = {
  [TName in keyof TRefDict]: TRefDict[TName] extends ISyncableObject
    ? TRefDict[TName]['syncable']
    : never
};

export type RefDictToSyncableObjectDict<T extends object> = T extends object
  ? {
      [TName in KeyOfValueWithType<Required<T>, SyncableRef>]: NonNullable<
        T[TName]
      > extends SyncableRef<infer TSyncableObject>
        ? TSyncableObject | (undefined extends T[TName] ? undefined : never)
        : never
    }
  : never;

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
        : never
    } &
      {
        [TName in KeyOfValueWithType<
          Required<T>,
          SyncableCreationRef
        >]: T[TName]
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
  buildSyncableDict(refDict: Dict<SyncableRef>): Dict<ISyncable> {
    return _.mapValues(refDict, ref => this.requireSyncable(ref));
  }

  buildSyncableObjectDict(refDict: Dict<SyncableRef>): Dict<TSyncableObject> {
    return _.mapValues(refDict, ref => this.requireSyncableObject(ref));
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
      syncableObjectMap = observable.map();
      typeToIdToSyncableObjectMapMap.set(type, syncableObjectMap);
    }

    let syncable = this.getSyncable(ref);

    if (!syncable) {
      return undefined;
    }

    object = this.adapter.instantiate(syncable, this);

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
    let {_id: id, _type: type} = snapshot;

    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;
    let syncableMap = typeToIdToSyncableMapMap.get(type);

    if (syncableMap) {
      let syncable = syncableMap.get(id);

      if (syncable) {
        if (clock === undefined || syncable._clock < clock) {
          replaceObject(syncable, snapshot);
        }

        return;
      }
    } else {
      syncableMap = observable.map();
      typeToIdToSyncableMapMap.set(type, syncableMap);
    }

    syncableMap.set(id, observable(_.cloneDeep(snapshot)));
  }

  @action
  updateMatchingSyncable(snapshot: ISyncable, clock?: number): void {
    let {_id: id, _type: type} = snapshot;

    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;
    let syncableMap = typeToIdToSyncableMapMap.get(type);

    if (!syncableMap) {
      return;
    }

    let syncable = syncableMap.get(id);

    if (syncable && (clock === undefined || syncable._clock < clock)) {
      replaceObject(syncable, snapshot);
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
