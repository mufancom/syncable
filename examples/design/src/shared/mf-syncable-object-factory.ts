import {Context, SyncableObjectFactory} from '@syncable/core';

import {MFSyncable, MFSyncableObject, Tag, User} from './syncables';

export class MFSyncableObjectFactory extends SyncableObjectFactory {
  create(syncable: MFSyncable, context: Context | undefined): MFSyncableObject {
    switch (syncable._type) {
      case 'tag':
        return new Tag(syncable, context);
      case 'user':
        return new User(syncable, context);
      default:
        throw new TypeError(`Unsupported syncable type "${syncable._type}"`);
    }
  }
}
