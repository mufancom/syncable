import {
  Context,
  Syncable,
  SyncableId,
  SyncableObject,
  SyncableRef,
  UserSyncableObject,
} from '@syncable/core';

export type ServerContextQueryFilter = (syncable: Syncable) => boolean;

export type ServerContextLockHandler = () => Promise<void>;

export abstract class ServerContext<
  TUser extends UserSyncableObject,
  TQuery = any
> extends Context<TUser> {
  private ensureSyncablePromiseMap = new Map<SyncableId, Promise<Syncable>>();

  private snapshotIdSet = new Set<SyncableId>();

  async initialize(userRef: SyncableRef<TUser>): Promise<Syncable[]> {
    let user = await this.resolve(userRef);

    if (!(user instanceof UserSyncableObject)) {
      throw new TypeError(
        'Expecting a `UserSyncableObject` to be resolved from `userRef`',
      );
    }

    this.user = user;

    return this.snapshot();
  }

  async snapshot(): Promise<Syncable[]> {
    let snapshotIdSet = this.snapshotIdSet;
    let syncables = await Promise.all(this.ensureSyncablePromiseMap.values());

    let result: Syncable[] = [];

    for (let syncable of syncables) {
      let id = syncable.$id;

      if (snapshotIdSet.has(id)) {
        continue;
      }

      snapshotIdSet.add(id);

      result.push(syncable);
    }

    return result;
  }

  async resolve<T extends SyncableObject>(ref: SyncableRef<T>): Promise<T> {
    let syncable = await this.ensureSyncable(ref);

    let requisiteRefs = (syncable.$associations || [])
      .filter(association => association.requisite)
      .map(association => association.ref);

    for (let ref of requisiteRefs) {
      await this.resolve(ref);
    }

    return this.get(ref)!;
  }

  protected abstract async lock(
    refs: SyncableRef[],
    handler: ServerContextLockHandler,
  ): Promise<void>;

  protected abstract getQueryFilter(query: TQuery): Promise<Syncable[]>;

  protected abstract async loadSyncable<T extends SyncableObject>(
    ref: SyncableRef<T>,
  ): Promise<T['syncable']>;

  protected async ensureSyncable(ref: SyncableRef): Promise<Syncable> {
    let map = this.ensureSyncablePromiseMap;
    let promise = map.get(ref.id);

    if (!promise) {
      promise = this.loadSyncable(ref).then(syncable => {
        this.addSyncable(syncable);
        return syncable;
      });

      map.set(ref.id, promise);

      return promise;
    }

    return promise;
  }
}
