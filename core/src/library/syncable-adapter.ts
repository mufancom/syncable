import {ISyncable, SyncableRef} from './syncable';
import {SyncableContainer} from './syncable-container';
import {ISyncableObject} from './syncable-object';

export interface ISyncableAdapter {
  instantiate(
    syncable: ISyncable,
    container: SyncableContainer,
  ): ISyncableObject;

  resolveDependencyRefs(syncable: ISyncable, options: unknown): SyncableRef[];
}
