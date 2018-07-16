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
  User extends UserSyncableObject
> extends Context<User> {
  private ensureSyncablePromiseMap = new Map<SyncableId, Promise<Syncable>>();

  constructor(private userRef: SyncableRefType<User>) {
    super();
  }

  async initialize(): Promise<void> {
    this.user = await this.resolve(this.userRef);
  }

  async resolve<T extends SyncableObject>(ref: SyncableRefType<T>): Promise<T> {
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
    ref: SyncableRefType<T>,
  ): Promise<SyncableType<T>>;

  protected async ensureSyncable<T extends SyncableObject>(
    ref: SyncableRefType<T>,
  ): Promise<SyncableType<T>> {
    let map = this.ensureSyncablePromiseMap;
    let promise = map.get(ref.id) as Promise<SyncableType<T>> | undefined;

    if (!promise) {
      promise = this.loadSyncable(ref).then(syncable => {
        this.add(syncable);
        return syncable;
      });

      map.set(ref.id, promise);

      return promise;
    }

    return promise;
  }
}
