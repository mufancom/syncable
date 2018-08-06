import {
  Syncable,
  SyncableId,
  SyncableObject,
  SyncableRef,
} from '@syncable/core';
import {ServerContext, ServerContextLockHandler} from '@syncable/server';

import {User} from '../shared';

export class MFServerContext extends ServerContext<User> {
  private lockingPromiseMap = new Map<SyncableId, Promise<void>>();

  protected async lock(
    refs: SyncableRef[],
    handler: ServerContextLockHandler,
  ): Promise<void> {
    let map = this.lockingPromiseMap;

    let ids = refs.map(ref => ref.id);

    let lockingPromiseSet = new Set<Promise<void>>();

    let resolver!: () => void;
    let rejector!: (error: any) => void;

    let promise = new Promise<void>((resolve, reject) => {
      resolver = resolve;
      rejector = reject;
    }).catch(console.error);

    for (let id of ids) {
      let lockingPromise = map.get(id);

      if (lockingPromise) {
        lockingPromiseSet.add(lockingPromise);
      }

      map.set(id, promise);
    }

    return Promise.all(lockingPromiseSet)
      .then(handler)
      .then(resolver, rejector);
  }

  protected loadSyncable<T extends SyncableObject>(
    ref: SyncableRef<T>,
  ): Promise<T['syncable']> {}

  protected getQueryFilter(query: any): Promise<Syncable[]> {}
}
