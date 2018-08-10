import * as DeepDiff from 'deep-diff';

import {Context, SyncableObjectFactory} from '../context';

import {Syncable, SyncableId, SyncableRef} from './syncable';
import {SyncableObject} from './syncable-object';

export class SyncableManager {
  private syncableMap = new Map<SyncableId, Syncable>();
  private syncableObjectMap = new Map<SyncableId, SyncableObject>();

  constructor(
    private factory: SyncableObjectFactory,
    private context?: Context,
  ) {}

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

  addSyncable(syncable: Syncable): void {
    let map = this.syncableMap;
    let id = syncable._id;

    if (map.has(id)) {
      throw new Error(`Syncable with ID "${id}" already exists in context`);
    }

    map.set(id, syncable);
  }

  /**
   * Update a syncable stored in context, please notice that it won't change
   * the reference of the originally stored syncable. Instead, differences will
   * be applied to it.
   */
  updateSyncable(snapshot: Syncable): void {
    let id = snapshot._id;

    let syncable = this.syncableMap.get(id);

    if (!syncable) {
      throw new Error(`Syncable with ID "${id}" does not exists in context`);
    }

    DeepDiff.applyDiff(syncable, snapshot, undefined!);
  }

  removeSyncable({id}: SyncableRef): void {
    let syncableMap = this.syncableMap;
    let syncableObjectMap = this.syncableObjectMap;

    if (!syncableMap.has(id)) {
      throw new Error(`Syncable with ID "${id}" does not exists in context`);
    }

    syncableMap.delete(id);
    syncableObjectMap.delete(id);
  }

  requireSyncableObject<T extends SyncableObject>(
    ref: SyncableRef<T>,
  ): T | undefined {
    let map = this.syncableObjectMap;

    let object = map.get(ref.id) as T | undefined;

    if (object) {
      return object;
    }

    let syncable = this.requireSyncable(ref);

    object = this.factory.create(syncable, this.context) as T;

    map.set(ref.id, object);

    return object;
  }

  requireContext(context = this.context): Context {
    if (!context) {
      throw new Error(
        'Context is neither available from parameter nor the instance',
      );
    }

    return context;
  }
}
