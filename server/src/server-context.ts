import {
  Context,
  Syncable,
  SyncableId,
  SyncableObject,
  SyncableRef,
  UserSyncableObject,
  getSyncableRef,
} from '@syncable/core';

export type ServerContextQueryFilter = (object: SyncableObject) => boolean;

export type ServerContextLockHandler = () => Promise<void>;

export abstract class ServerContext<
  TUser extends UserSyncableObject,
  TContextQuery,
  TGroupQuery
> extends Context<TUser, TContextQuery> {
  private groupQueryPromise: Promise<void> | undefined;
  private snapshotIdSet = new Set<SyncableId>();

  async initialize(
    userRef: SyncableRef<TUser>,
    contextQuery: TContextQuery,
    groupQuery: TGroupQuery,
  ): Promise<Syncable[]> {
    await (this.groupQueryPromise ||
      (this.groupQueryPromise = this.ensureSyncableGroup(groupQuery)));

    let user = await this.get(userRef);

    if (!(user instanceof UserSyncableObject)) {
      throw new TypeError(
        'Expecting a `UserSyncableObject` to be resolved from `userRef`',
      );
    }

    this.user = user;

    return this.snapshot(contextQuery);
  }

  async snapshot(query: TContextQuery): Promise<Syncable[]> {
    let cache = this.cache;
    let snapshotIdSet = this.snapshotIdSet;

    let syncables = cache.syncables;
    let filter = this.getContextQueryFilter(query);

    let result: Syncable[] = [];

    for (let syncable of syncables) {
      let id = syncable.$id;

      if (snapshotIdSet.has(id)) {
        continue;
      }

      let ref = getSyncableRef(syncable);
      let object = this.require(ref);

      if (!filter(object) || !object.testAccessRights(['read'])) {
        continue;
      }

      snapshotIdSet.add(id);

      result.push(syncable);
    }

    return result;
  }

  protected abstract getContextQueryFilter(
    query: TContextQuery,
  ): ServerContextQueryFilter;

  protected abstract async ensureSyncableGroup(
    query: TGroupQuery,
  ): Promise<void>;
}
