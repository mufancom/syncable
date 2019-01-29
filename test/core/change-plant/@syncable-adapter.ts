import {ISyncableAdapter} from '@syncable/core';

import {Task} from './@syncables';
import {SyncableObject} from './@types';

export interface SyncableAdapterGenericParams {
  syncableObject: SyncableObject;
}

export const syncableAdapter: ISyncableAdapter<SyncableAdapterGenericParams> = {
  instantiate(syncable, container) {
    switch (syncable._type) {
      case 'task':
        return new Task(syncable, container);
    }
  },
};
