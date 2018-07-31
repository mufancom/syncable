import {Context, SyncableObjectFactory, SyncableType} from '@syncable/core';

import {MFSyncable, MFSyncableObject, Tag} from './syncables';

export class MFSyncableObjectFactory extends SyncableObjectFactory<
  MFSyncableObject
> {
  create<T extends MFSyncableObject>(
    syncable: SyncableType<T>,
    context: Context,
  ): T;
  create(syncable: MFSyncable, context: Context): MFSyncableObject {
    switch (syncable.$type) {
      case 'tag':
        return new Tag(syncable, context);
      default:
        throw new TypeError(`Unsupported syncable type "${syncable.$type}"`);
    }
  }
}
