import {ServerContext} from '@syncable/server';

import {SyncableObject, SyncableRef} from '@syncable/core';

import {User} from '../shared';

export class MFServerContext extends ServerContext<User> {
  protected lock(...refs: SyncableRef[]): Promise<void> {
    throw new Error('Method not implemented.');
  }

  protected loadSyncable<T extends SyncableObject>(
    ref: SyncableRef<T>,
  ): Promise<T['syncable']> {
    throw new Error('Method not implemented.');
  }
}
