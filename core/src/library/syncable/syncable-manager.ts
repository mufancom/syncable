import _ from 'lodash';
import {ObservableMap, action, observable} from 'mobx';
import replaceObject from 'replace-object';

import {ISyncableObjectProvider} from '../context';

import {
  ISyncable,
  SyncableAssociation,
  SyncableId,
  SyncableRef,
} from './syncable';
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

  constructor(readonly provider: ISyncableObjectProvider) {}

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

    let relatedIds = this.getRelatedIds(snapshot);

    this.addRelatedTargetSyncable(syncable, relatedIds);
  }

  /**
   * Update a syncable stored by this manager, please notice that it won't change
   * the reference of the originally stored syncable. Instead, differences will
   * be applied to it.
   */
  @action
  updateSyncable(snapshot: ISyncable): void {
    let {_id: id, _type: type} = snapshot;

    let typeToIdToSyncableMapMap = this.typeToIdToSyncableMapMap;
    let syncableMap = typeToIdToSyncableMapMap.get(type);

    let syncable = syncableMap && syncableMap.get(id);

    if (!syncable) {
      throw new Error(`Syncable with ID "${id}" does not exists in context`);
    }

    let previousRelatedIds = this.getRelatedIds(syncable);
    let nextRelatedIds = this.getRelatedIds(snapshot);

    replaceObject(syncable, snapshot);

    let newRelatedIds = _.difference(nextRelatedIds, previousRelatedIds);

    let obsoleteRelatedIds = _.difference(previousRelatedIds, nextRelatedIds);

    this.addRelatedTargetSyncable(syncable, newRelatedIds);
    this.removeRelatedTargetSyncable(syncable, obsoleteRelatedIds);
  }

  @action
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

    let relatedIds = this.getRelatedIds(syncable);

    this.removeRelatedTargetSyncable(syncable, relatedIds);
  }

  getAssociatedTargetSyncables(source: SyncableRef | ISyncable): ISyncable[] {
    let id = 'id' in source ? source.id : source._id;

    let set = this.associatedTargetSyncableSetMap.get(id);

    return set ? Array.from(set) : [];
  }

  requireAssociatedSyncables(
    syncable: ISyncable,
    securesOnly?: boolean,
  ): ISyncable[] {
    return this.getAssociations(syncable, securesOnly).map(association =>
      this.requireSyncable(association.ref),
    );
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

    object = this.provider.create(syncable, this) as T;

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

  requireAssociatedSyncableObjects(
    syncable: ISyncable,
    securesOnly?: boolean,
  ): ISyncableObject[] {
    return this.getAssociations(syncable, securesOnly).map(association =>
      this.requireSyncableObject(association.ref),
    );
  }

  @action
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

  getRelatedRefs(syncable: ISyncable, securesOnly = false): SyncableRef[] {
    let associations = this.getAssociations(syncable, securesOnly).map(
      association => association.ref,
    );
    let {_extends} = syncable;

    return _extends && _extends.secures
      ? [...associations, _extends.ref]
      : [...associations];
  }

  private getRelatedIds(syncable: ISyncable): SyncableId[] {
    return this.getRelatedRefs(syncable).map(ref => ref.id);
  }

  private getAssociations(
    syncable: ISyncable,
    securesOnly = false,
  ): SyncableAssociation[] {
    let associations = this.provider.resolveAssociations(syncable);

    if (securesOnly) {
      associations = associations.filter(association => association.secures);
    }

    return associations;
  }

  private addRelatedTargetSyncable(
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

  private removeRelatedTargetSyncable(
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
