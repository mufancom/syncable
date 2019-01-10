import {AccessRight} from '../access-control';
import {Context} from '../context';

import {ISyncable, SyncableRef} from './syncable';
import {SyncableManager} from './syncable-manager';

export class SyncableProvider {
  constructor(private manager: SyncableManager, private context: Context) {}

  testAccessRights(ref: SyncableRef, rights: AccessRight[]): boolean {
    let object = this.manager.getSyncableObject(ref);
    return !!object && object.testAccessRights(rights, this.context);
  }

  getSyncable(ref: SyncableRef): ISyncable | undefined {
    if (!this.testAccessRights(ref, ['read'])) {
      return undefined;
    }

    return this.manager.getSyncable(ref);
  }

  getSyncables(type?: string): ISyncable[] {
    return this.manager
      .getSyncables(type)
      .filter(syncable =>
        this.testAccessRights({id: syncable._id, type: syncable._type}, [
          'read',
        ]),
      );
  }

  removeSyncable(ref: SyncableRef): void {
    if (this.testAccessRights(ref, ['full'])) {
      this.manager.removeSyncable(ref);
    }
  }

  updateSyncable(syncable: ISyncable): void {
    if (
      this.testAccessRights({id: syncable._id, type: syncable._type}, ['write'])
    ) {
      this.manager.updateSyncable(syncable);
    }
  }
}
