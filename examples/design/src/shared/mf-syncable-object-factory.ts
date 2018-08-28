import {AbstractSyncableObjectFactory, SyncableManager} from '@syncable/core';

import {MFSyncable, MFSyncableObject, Tag, User} from './syncables';

export class MFSyncableObjectFactory extends AbstractSyncableObjectFactory {
  create(syncable: MFSyncable, manager: SyncableManager): MFSyncableObject {
    switch (syncable._type) {
      case 'tag':
        return new Tag(syncable, manager);
      case 'user':
        return new User(syncable, manager);
      default:
        throw new TypeError(`Unsupported syncable type "${syncable._type}"`);
    }
  }
}
