import {ISyncableAdapter} from '@syncable/core';

import {Context} from './context';
import {Kanban, SyncableObject, Task, User} from './syncables';

export interface SyncableAdapterGenericParams {
  context: Context;
  syncableObject: SyncableObject;
}

export const syncableAdapter: ISyncableAdapter<SyncableAdapterGenericParams> = {
  instantiateByRef(ref, container) {
    switch (ref.type) {
      case 'user':
        return new User(ref, container);
      case 'task':
        return new Task(ref, container);
      case 'kanban':
        return new Kanban(ref, container);
    }
  },
  instantiateBySyncable(syncable) {
    switch (syncable._type) {
      case 'user':
        return new User(syncable);
      case 'task':
        return new Task(syncable);
      case 'kanban':
        return new Kanban(syncable);
    }
  },
  getViewQueryFilter() {
    return () => true;
  },
};
