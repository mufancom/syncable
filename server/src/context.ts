import {
  Context,
  Syncable,
  SyncableId,
  SyncableObject,
  SyncableRef,
  SyncableRefType,
  SyncableType,
  UserSyncableObject,
} from '@syncable/core';

export abstract class ServerContext<
  User extends UserSyncableObject = UserSyncableObject,
  OtherSyncableObject extends SyncableObject = SyncableObject
> extends Context<User, OtherSyncableObject> {
  private ensureSyncablePromiseMap = new Map<SyncableId, Promise<Syncable>>();

  async initialize(userRef: SyncableRefType<User>): Promise<void> {
    this.user = await this.resolve<User>(userRef);
  }

  async resolve<T extends User | OtherSyncableObject>(
    ref: SyncableRefType<T>,
  ): Promise<T> {
    let syncable = await this.ensureSyncable(ref);

    let requisiteRefs = (syncable.$associations || [])
      .filter(association => association.requisite)
      .map(
        association =>
          association.ref as SyncableRefType<User | OtherSyncableObject>,
      );

    for (let ref of requisiteRefs) {
      await this.resolve(ref as SyncableRefType<T>);
    }

    return this.get(ref)!;
  }

  protected abstract async lock(...refs: SyncableRef[]): Promise<void>;

  protected abstract async loadSyncable<T extends User | OtherSyncableObject>(
    ref: SyncableRefType<T>,
  ): Promise<SyncableType<T>>;

  protected async ensureSyncable<T extends User | OtherSyncableObject>(
    ref: SyncableRefType<T>,
  ): Promise<SyncableType<T>> {
    let map = this.ensureSyncablePromiseMap;
    let promise = map.get(ref.id) as Promise<SyncableType<T>> | undefined;

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
