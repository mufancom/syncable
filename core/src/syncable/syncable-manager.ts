import * as DeepDiff from 'deep-diff';
import _ from 'lodash';
import {ObservableMap, observable} from 'mobx';

import {ISyncableObjectProvider} from '../context';

import {ISyncable, SyncableId, SyncableRef} from './syncable';
import {ISyncableObject} from './syncable-object';

export class SyncableManager {
  private typeToIdToSyncableMapMap = observable.map<
    string,
    ObservableMap<SyncableId, ISyncable>
  >();

  private typeToIdToSyncableObjectMapMap = observable.map<
    string,
    ObservableMap<SyncableId, ISyncableObject>
  >();

  private associatedTargetSyncableSetMap = new Map<
    SyncableId,
    Set<ISyncable>
  >();

  constructor(private factory: ISyncableObjectProvider) {}

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
  addSyncable(snapshot: ISyncable, update = false): void {
    let {_id: id, _type: type} = snapshot;

    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;
    let syncableMap = typeToIdToSyncableMapMap.get(type);

    if (syncableMap) {
      if (syncableMap.has(id)) {
        if (update) {
          this.updateSyncable(snapshot);
          return;
        }

        throw new Error(`Syncable with ID "${id}" already exists in context`);
      }
    } else {
      syncableMap = observable.map();
      typeToIdToSyncableMapMap.set(type, syncableMap);
    }

    let syncable = observable(snapshot);

    syncableMap.set(id, syncable);

    let associationIds = (snapshot._associations || []).map(
      association => association.ref.id,
    );

    this.addAssociatedTargetSyncable(syncable, associationIds);
  }

  /**
   * Update a syncable stored by this manager, please notice that it won't change
   * the reference of the originally stored syncable. Instead, differences will
   * be applied to it.
   */
  updateSyncable(snapshot: ISyncable): void {
    let {_id: id, _type: type} = snapshot;

    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;
    let syncableMap = typeToIdToSyncableMapMap.get(type);

    let syncable = syncableMap && syncableMap.get(id);

    if (!syncable) {
      throw new Error(`Syncable with ID "${id}" does not exists in context`);
    }

    let previousAssociationIds = (syncable._associations || []).map(
      association => association.ref.id,
    );
    let nextAssociationIds = (snapshot._associations || []).map(
      association => association.ref.id,
    );

    DeepDiff.applyDiff(syncable, snapshot, undefined!);

    let newAssociationIds = _.difference(
      nextAssociationIds,
      previousAssociationIds,
    );

    let obsoleteAssociationIds = _.difference(
      previousAssociationIds,
      nextAssociationIds,
    );

    this.addAssociatedTargetSyncable(syncable, newAssociationIds);
    this.removeAssociatedTargetSyncable(syncable, obsoleteAssociationIds);
  }

  removeSyncable({type, id}: SyncableRef): void {
    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;
    let typeToIdToSyncableObjectMapMap = this.typeToIdToSyncableObjectMapMap;

    let syncableMap = typeToIdToSyncableMapMap.get(type);

    let syncable = syncableMap && syncableMap.get(id);

    if (!syncable) {
      throw new Error(`Syncable with ID "${id}" does not exists in context`);
    }

    syncableMap!.delete(id);

    let syncableObjectMap = typeToIdToSyncableObjectMapMap.get(type);

    if (syncableObjectMap) {
      syncableObjectMap.delete(id);
    }

    let associationIds = (syncable._associations || []).map(
      association => association.ref.id,
    );

    this.removeAssociatedTargetSyncable(syncable, associationIds);
  }

  getAssociatedTargetSyncables(source: SyncableRef | ISyncable): ISyncable[] {
    let id = 'id' in source ? source.id : source._id;

    let set = this.associatedTargetSyncableSetMap.get(id);

    return set ? Array.from(set) : [];
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

    object = this.factory.create(syncable, this) as T;

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

  clear(): void {
    clearMapOrSetMap(this.typeToIdToSyncableMapMap);
    clearMapOrSetMap(this.typeToIdToSyncableObjectMapMap);
    clearMapOrSetMap(this.associatedTargetSyncableSetMap);

    function clearMapOrSetMap(
      mapMap: Map<any, Map<any, any> | Set<any>>,
    ): void {
      for (let map of Array.from(mapMap.values())) {
        map.clear();
      }
    }
  }

  private addAssociatedTargetSyncable(
    syncable: ISyncable,
    ids: SyncableId[],
  ): void {
    let associatedTargetSyncableSetMap = this.associatedTargetSyncableSetMap;

    for (let id of ids) {
      let set = associatedTargetSyncableSetMap.get(id);

      if (!set) {
        set = new Set();
        associatedTargetSyncableSetMap.set(id, set);
      } else if (set.has(syncable)) {
        console.error('Expecting associated target syncable not exists in set');
        continue;
      }

      set.add(syncable);
    }
  }

  private removeAssociatedTargetSyncable(
    syncable: ISyncable,
    ids: SyncableId[],
  ): void {
    let associatedTargetSyncableSetMap = this.associatedTargetSyncableSetMap;

    for (let id of ids) {
      let set = associatedTargetSyncableSetMap.get(id);

      if (!set || !set.has(syncable)) {
        console.error(
          'Expecting associated target syncable already exists in set',
        );
        continue;
      }

      set.delete(syncable);
    }
  }
}
