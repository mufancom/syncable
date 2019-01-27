import {IContext, ISyncable, ISyncableAdapter} from '@syncable/core';

export function filterReadableSyncables(
  context: IContext,
  adapter: ISyncableAdapter,
  syncables: ISyncable[],
): ISyncable[] {
  return syncables.filter(syncable =>
    adapter.instantiate(syncable).testAccessRights(['read'], context),
  );
}
