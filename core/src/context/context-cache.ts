import * as DeepDiff from 'deep-diff';

import {Syncable, SyncableId, SyncableObject, SyncableRef} from '../syncable';

export class ContextCache {
  private syncableMap = new Map<SyncableId, Syncable>();
  private syncableObjectMap = new Map<SyncableId, SyncableObject>();

  get syncables(): Syncable[] {
    return Array.from(this.syncableMap.values());
  }

  existsSyncable({id}: SyncableRef): boolean {
    return this.syncableMap.has(id);
  }

  getSyncable({id}: SyncableRef): Syncable | undefined {
    return this.syncableMap.get(id);
  }

  addSyncable(syncable: Syncable): void {
    let map = this.syncableMap;
    let id = syncable.$id;

    if (map.has(id)) {
      throw new Error(`Syncable with ID "${id}" already exists in context`);
    }

    map.set(id, syncable);
  }

  updateSyncable(snapshot: Syncable): void {
    let id = snapshot.$id;

    let syncable = this.syncableMap.get(id);

    if (!syncable) {
      throw new Error(`Syncable with ID "${id}" does not exists in context`);
    }

    DeepDiff.applyDiff(syncable, snapshot, undefined!);
  }

  removeSyncable({id}: SyncableRef): void {
    let map = this.syncableMap;
    let objectMap = this.syncableObjectMap;

    if (!map.has(id)) {
      throw new Error(`Syncable with ID "${id}" does not exists in context`);
    }

    map.delete(id);
    objectMap.delete(id);
  }

  getSyncableObject({id}: SyncableRef): SyncableObject | undefined {
    return this.syncableObjectMap.get(id);
  }

  setSyncableObject({id}: SyncableRef, object: SyncableObject): void {
    this.syncableObjectMap.set(id, object);
  }
}
