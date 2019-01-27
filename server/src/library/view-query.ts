import {ISyncable} from '@syncable/core';

export type ViewQueryFilter<T extends ISyncable = ISyncable> = (
  object: T,
) => boolean;
