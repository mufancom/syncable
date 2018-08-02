import * as DeepDiff from 'deep-diff';

import {Permission} from '../access-control';
import {
  GetAssociationOptions,
  Syncable,
  SyncableId,
  SyncableObject,
  SyncableRef,
  UserSyncableObject,
} from '../syncable';
import {SyncableObjectFactory} from './syncable-object-factor';

export type AccessControlRuleTester = (
  target: SyncableObject,
  context: Context,
  options?: object,
) => boolean;

export abstract class Context<
  TUser extends UserSyncableObject = UserSyncableObject,
  TQuery = any
> {
  protected user!: TUser;

  private query: TQuery | undefined;

  private syncableMap = new Map<SyncableId, Syncable>();
  private syncableObjectMap = new WeakMap<Syncable, SyncableObject>();

  constructor(protected syncableObjectFactory: SyncableObjectFactory) {}

  get permissions(): Permission[] {
    return this.user.permissions;
  }

  async updateQuery(query: TQuery): Promise<void> {
    this.query = query;
  }

  addSyncable(syncable: Syncable): void {
    let map = this.syncableMap;
    let id = syncable.$id;

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
    let id = snapshot.$id;

    let syncable = this.syncableMap.get(id);

    if (!syncable) {
      throw new Error(`Syncable with ID "${id}" does not exists in context`);
    }

    DeepDiff.applyDiff(syncable, snapshot, undefined!);
  }

  removeSyncable({id}: SyncableRef): void {
    let map = this.syncableMap;

    if (!map.has(id)) {
      throw new Error(`Syncable with ID "${id}" does not exists in context`);
    }

    map.delete(id);

    // As `this.syncableObjectMap` is a weak map, it should be okay not to delete
    // correspondent object.
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

  get<T extends SyncableObject>(ref: SyncableRef<T>): T | undefined {
    let syncable = this.getSyncable(ref);

    if (!syncable) {
      return undefined;
    }

    let syncableObjectMap = this.syncableObjectMap;

    let object = syncableObjectMap.get(syncable) as T | undefined;

    if (!object) {
      object = this.syncableObjectFactory.create<T>(syncable, this);
      syncableObjectMap.set(syncable, object);
    }

    return object;
  }

  require<T extends SyncableObject>(ref: SyncableRef<T>): T {
    let object = this.get(ref);

    if (!object) {
      throw new Error(`Syncable "${JSON.stringify(ref)}" not added to context`);
    }

    return object;
  }

  getRequisiteAssociations(
    options: GetAssociationOptions = {},
  ): SyncableObject[] {
    return this.user.getRequisiteAssociations(options);
  }

  protected abstract loadByQuery(query: TQuery): Promise<Syncable[]>;
}
