import {ISyncable, SyncableRef} from '@syncable/core';
import {Dict} from 'tslang';

export type ViewQueryFilter<T extends ISyncable = ISyncable> = (
  object: T,
) => boolean;

export interface IViewQuery {
  refs: object;
  options: object;
}

export interface GeneralViewQuery extends IViewQuery {
  refs: Dict<SyncableRef>;
}
