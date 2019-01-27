import _ from 'lodash';
import {ObservableMap, action, observable} from 'mobx';
import replaceObject from 'replace-object';

import {ISyncable, SyncableId, SyncableRef} from './syncable';
import {ISyncableAdapter} from './syncable-adapter';
import {ISyncableObject} from './syncable-object';

export class SyncableContainer {
  private typeToIdToSyncableMapMap = observable.map<
    string,
    ObservableMap<SyncableId, ISyncable>
  >();

  private typeToIdToSyncableObjectMapMap = observable.map<
    string,
    ObservableMap<SyncableId, ISyncableObject>
  >();

  constructor(readonly adapter: ISyncableAdapter) {}

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

  existsSyncable({type, id}: SyncableRef): boolean {
    let syncableMap = this.typeToIdToSyncableMapMap.get(type);
    return !!syncableMap && syncableMap.has(id);
  }

  getSyncable<T extends ISyncableObject>({
    type,
    id,
  }: SyncableRef<T>): T['syncable'] | undefined {
    let syncableMap = this.typeToIdToSyncableMapMap.get(type);
    return syncableMap && syncableMap.get(id);
  }

  requireSyncable<T extends ISyncableObject>(
    ref: SyncableRef<T>,
  ): T['syncable'] {
    let syncable = this.getSyncable(ref);

    if (!syncable) {
      throw new Error(`Syncable "${JSON.stringify(ref)}" not added to context`);
    }

    return syncable;
  }

  /**
   * Add a syncable, please notice that it won't change the reference of the
   * originally stored syncable. Instead, differences will be applied to it.
   */
  @action
  addSyncable(snapshot: ISyncable): void {
    snapshot = _.cloneDeep(snapshot);

    let {_id: id, _type: type} = snapshot;

    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;
    let syncableMap = typeToIdToSyncableMapMap.get(type);

    if (syncableMap) {
      if (syncableMap.has(id)) {
        this.updateSyncable(snapshot);
      }
    } else {
      syncableMap = observable.map();
      typeToIdToSyncableMapMap.set(type, syncableMap);
    }

    let syncable = observable(snapshot);

    syncableMap.set(id, syncable);
  }

  /**
   * Update a syncable stored by this manager, please notice that it won't change
   * the reference of the originally stored syncable. Instead, differences will
   * be applied to it.
   */
  @action
  updateSyncable(snapshot: ISyncable): void {
    snapshot = _.cloneDeep(snapshot);

    let {_id: id, _type: type} = snapshot;

    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;
    let syncableMap = typeToIdToSyncableMapMap.get(type);

    let syncable = syncableMap && syncableMap.get(id);

    if (!syncable) {
      throw new Error(`Syncable with ID "${id}" does not exists in context`);
    }

    replaceObject(syncable, snapshot);
  }

  @action
  removeSyncable({type, id}: SyncableRef, syncing = false): void {
    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;
    let typeToIdToSyncableObjectMapMap = this.typeToIdToSyncableObjectMapMap;

    let syncableMap = typeToIdToSyncableMapMap.get(type);

    let syncable = syncableMap && syncableMap.get(id);

    if (!syncable) {
      if (syncing) {
        return;
      }

      throw new Error(`Syncable with ID "${id}" does not exists in context`);
    }

    syncableMap!.delete(id);

    let syncableObjectMap = typeToIdToSyncableObjectMapMap.get(type);

    if (syncableObjectMap) {
      syncableObjectMap.delete(id);
    }
  }

  getSyncableObject<T extends ISyncableObject>(
    ref: SyncableRef<T>,
  ): T | undefined {
    let {type, id} = ref;

    let typeToIdToSyncableObjectMapMap = this.typeToIdToSyncableObjectMapMap;

    let syncableObjectMap = typeToIdToSyncableObjectMapMap.get(type);

    let object: T | undefined;

    if (syncableObjectMap) {
      object = syncableObjectMap.get(id) as T | undefined;

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

    object = this.adapter.instantiate(syncable, this) as T;

    syncableObjectMap.set(id, object);

    return object;
  }

  requireSyncableObject<T extends ISyncableObject>(ref: SyncableRef<T>): T {
    let object = this.getSyncableObject(ref);

    if (!object) {
      throw new Error(`Syncable "${JSON.stringify(ref)}" not added to context`);
    }

    return object;
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
