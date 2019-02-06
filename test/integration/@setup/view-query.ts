import {SyncableRef} from '@syncable/core';

import {Kanban} from './syncables';

export interface ViewQuery {
  default: {
    refs: {};
    options: {};
  };
  task: {
    refs: {};
    options: {};
  };
  kanban: {
    refs: {
      kanban: SyncableRef<Kanban>;
    };
    options: {};
  };
}
