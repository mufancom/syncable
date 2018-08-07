import {ServerContext, ServerContextQueryFilter} from '@syncable/server';

import {MFContextQuery, User} from '../shared';

export interface MFGroupQuery {
  organization: string;
}

export class MFServerContext extends ServerContext<
  User,
  MFContextQuery,
  MFGroupQuery
> {
  // private lockingPromiseMap = new Map<SyncableId, Promise<void>>();

  // protected async lock(
  //   refs: SyncableRef[],
  //   handler: ServerContextLockHandler,
  // ): Promise<void> {
  //   let map = this.lockingPromiseMap;

  //   let ids = refs.map(ref => ref.id);

  //   let lockingPromiseSet = new Set<Promise<void>>();

  //   let resolver!: () => void;
  //   let rejector!: (error: any) => void;

  //   let promise = new Promise<void>((resolve, reject) => {
  //     resolver = resolve;
  //     rejector = reject;
  //   }).catch(console.error);

  //   for (let id of ids) {
  //     let lockingPromise = map.get(id);

  //     if (lockingPromise) {
  //       lockingPromiseSet.add(lockingPromise);
  //     }

  //     map.set(id, promise);
  //   }

  //   return Promise.all(lockingPromiseSet)
  //     .then(handler)
  //     .then(resolver, rejector);
  // }

  protected getContextQueryFilter(
    _query: MFContextQuery,
  ): ServerContextQueryFilter {
    return () => true;
  }

  protected ensureSyncableGroup(_query: MFGroupQuery): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
