import * as DeepDiff from 'deep-diff';
import _ from 'lodash';
import {observable} from 'mobx';

import {SyncableObjectFactory} from '../context';

import {Syncable, SyncableId, SyncableRef} from './syncable';
import {SyncableObject} from './syncable-object';

export class SyncableManager {
  private syncableMap = new Map<SyncableId, Syncable>();
  private syncableObjectMap = new Map<SyncableId, SyncableObject>();
  private associatedTargetSyncableSetMap = new Map<SyncableId, Set<Syncable>>();

  constructor(private factory: SyncableObjectFactory) {}

  get syncables(): Syncable[] {
    return Array.from(this.syncableMap.values());
  }

  existsSyncable({id}: SyncableRef): boolean {
    return this.syncableMap.has(id);
  }

  getSyncable<T extends SyncableObject>({
    id,
  }: SyncableRef<T>): T['syncable'] | undefined {
    return this.syncableMap.get(id);
  }

  requireSyncable<T extends SyncableObject>(
    ref: SyncableRef<T>,
  ): T['syncable'] {
    let syncable = this.getSyncable(ref);

    if (!syncable) {
      throw new Error(`Syncable "${JSON.stringify(ref)}" not added to context`);
    }

    return syncable;
  }

  /**
   * Add a syncable, please notice that it won't change
   * the reference of the originally stored syncable. Instead, differences will
   * be applied to it.
   */
  addSyncable(snapshot: Syncable): void {
    let syncableMap = this.syncableMap;
    let id = snapshot._id;

    if (syncableMap.has(id)) {
      throw new Error(`Syncable with ID "${id}" already exists in context`);
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
  updateSyncable(snapshot: Syncable): void {
    let syncableMap = this.syncableMap;
    let id = snapshot._id;

    let syncable = syncableMap.get(id);

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

  removeSyncable({id}: SyncableRef): void {
    let syncableMap = this.syncableMap;
    let syncableObjectMap = this.syncableObjectMap;

    let syncable = syncableMap.get(id);

    if (!syncable) {
      throw new Error(`Syncable with ID "${id}" does not exists in context`);
    }

    syncableMap.delete(id);
    syncableObjectMap.delete(id);

    let associationIds = (syncable._associations || []).map(
      association => association.ref.id,
    );

    this.removeAssociatedTargetSyncable(syncable, associationIds);
  }

  getAssociatedTargetSyncables(source: SyncableRef | Syncable): Syncable[] {
    let id = 'id' in source ? source.id : source._id;

    let set = this.associatedTargetSyncableSetMap.get(id);

    return set ? Array.from(set) : [];
  }

  requireSyncableObject<T extends SyncableObject>(ref: SyncableRef<T>): T {
    let map = this.syncableObjectMap;

    let object = map.get(ref.id) as T | undefined;

    if (object) {
      return object;
    }

    let syncable = this.requireSyncable(ref);

    object = this.factory.create(syncable, this) as T;

    map.set(ref.id, object);

    return object;
  }

  private addAssociatedTargetSyncable(
    syncable: Syncable,
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
    syncable: Syncable,
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
