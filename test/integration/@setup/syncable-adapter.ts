import {ISyncableAdapter} from '@syncable/core';

import {SyncableObject, Task, User} from './syncables';

export interface SyncableAdapterGenericParams {
  syncableObject: SyncableObject;
  dependencyResolveOptions: unknown;
}

export const syncableAdapter: ISyncableAdapter<SyncableAdapterGenericParams> = {
  instantiate(syncable, container) {
    switch (syncable._type) {
      case 'task':
        return new Task(syncable, container);
      case 'user':
        return new User(syncable, container);
    }
  },
  resolveDependencyRefs() {
    return [];
  },
};
