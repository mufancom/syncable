import {IContext, ISyncable, ISyncableAdapter} from '@syncable/core';
import _ from 'lodash';

export function filterReadableSyncables(
  context: IContext,
  adapter: ISyncableAdapter,
  syncables: ISyncable[],
  toSanitizeFields = false,
): ISyncable[] {
  return _.compact(
    syncables.map(syncable => {
      let object = adapter.instantiate(syncable);

      if (!object.testAccessRights(['read'], context)) {
        return undefined;
      }

      if (toSanitizeFields) {
        return _.omit(
          syncable,
          object.getSanitizedFieldNames(context),
        ) as ISyncable;
      }

      return syncable;
    }),
  );
}
