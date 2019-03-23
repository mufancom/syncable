import {IContext, ISyncable, ISyncableAdapter} from '@syncable/core';
import _ from 'lodash';

export function filterReadableSyncablesAndSanitize(
  context: IContext,
  adapter: ISyncableAdapter,
  syncables: ISyncable[],
): ISyncable[] {
  return _.compact(
    syncables.map(syncable => {
      let object = adapter.instantiate(syncable);

      if (!object.testAccessRights(['read'], context)) {
        return undefined;
      }

      let sanitizedFieldNames = object.getSanitizedFieldNames(context);

      return _.omit(syncable, sanitizedFieldNames) as ISyncable;
    }),
  );
}
