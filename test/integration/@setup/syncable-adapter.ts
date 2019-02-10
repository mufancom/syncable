import {ISyncableAdapter} from '@syncable/core';

import {Context} from './context';
import {Kanban, SyncableObject, Task, User} from './syncables';

export interface SyncableAdapterGenericParams {
  context: Context;
  syncableObject: SyncableObject;
}

export const syncableAdapter: ISyncableAdapter<SyncableAdapterGenericParams> = {
  instantiate(syncable, container) {
    switch (syncable._type) {
      case 'user':
        return new User(syncable, container);
      case 'task':
        return new Task(syncable, container);
      case 'kanban':
        return new Kanban(syncable, container);
    }
  },
  getViewQueryFilter() {
    return () => true;
  },
};
