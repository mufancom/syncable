import {IContext, ISyncable, ISyncableAdapter} from '@syncable/core';
import _ from 'lodash';

export function filterReadableSyncables(
  context: IContext,
  adapter: ISyncableAdapter,
  syncables: ISyncable[],
  toSanitizeFields = false,
  onSanitize?: (syncable: ISyncable, sanitizedFieldNames: string[]) => void,
): ISyncable[] {
  return _.compact(
    syncables.map(syncable => {
      let object = adapter.instantiateBySyncable(syncable);

      if (!object.testAccessRights(['read'], context)) {
        return undefined;
      }

      if (toSanitizeFields) {
        let sanitizedFieldNames = object.getSanitizedFieldNames(context);

        if (onSanitize) {
          onSanitize(syncable, sanitizedFieldNames);
        }

        syncable._sanitizedFieldNames = sanitizedFieldNames;

        return _.omit(syncable, sanitizedFieldNames) as ISyncable;
      }

      return syncable;
    }),
  );
}
