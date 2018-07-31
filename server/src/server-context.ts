import {
  Context,
  Syncable,
  SyncableId,
  SyncableObject,
  SyncableRef,
  UserSyncableObject,
} from '@syncable/core';

export abstract class ServerContext<
  TUser extends UserSyncableObject
> extends Context<TUser> {
  private ensureSyncablePromiseMap = new Map<SyncableId, Promise<Syncable>>();

  async initialize(userRef: SyncableRef<TUser>): Promise<void> {
    let user = await this.resolve(userRef);

    if (!(user instanceof UserSyncableObject)) {
      throw new TypeError(
        'Expecting a `UserSyncableObject` to be resolved from `userRef`',
      );
    }

    this.user = user;
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

  protected abstract async lock(...refs: SyncableRef[]): Promise<void>;

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
