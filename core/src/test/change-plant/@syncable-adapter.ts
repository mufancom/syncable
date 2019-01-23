import {ISyncableAdapter} from '@syncable/core';

import {Task} from './@syncables';
import {SyncableDependencyResolveOptions, SyncableObject} from './@types';

export interface SyncableAdapterGenericParams {
  syncableObject: SyncableObject;
  dependencyResolveOptions: SyncableDependencyResolveOptions;
}

export const syncableAdapter: ISyncableAdapter<SyncableAdapterGenericParams> = {
  instantiate(syncable, container) {
    switch (syncable._type) {
      case 'task':
        return new Task(syncable, container);
    }
  },
  resolveDependencyRefs(_syncable) {
    return [];
  },
};
