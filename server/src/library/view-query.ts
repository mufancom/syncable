import {ISyncable, SyncableRef, SyncableType} from '@syncable/core';
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

type ViewQueryRefDictToViewQuerySyncableDict<T extends object> = {
  [TName in keyof T]: SyncableType<T[TName]>
};

export type ResolvedViewQuery<T> = T extends IViewQuery
  ? {
      syncables: ViewQueryRefDictToViewQuerySyncableDict<T['refs']>;
      options: T['options'];
    }
  : never;

export type ViewQueryObjectToResolvedViewQueryObject<T extends object> = {
  [TName in keyof T]: ResolvedViewQuery<T[TName]>
};
