import {Dict} from 'tslang';

import {ISyncable, SyncableRef, SyncableType} from '../syncable';

export type ViewQueryUpdateObject<TViewQueryObject extends object> = {
  [TName in keyof TViewQueryObject]?: TViewQueryObject[TName] | false
};

export type ViewQueryFilter<T extends ISyncable = ISyncable> = (
  syncable: T,
) => boolean;

export interface IViewQuery {
  refs: object;
  options: object;
}

export interface GeneralViewQuery extends IViewQuery {
  refs: Dict<SyncableRef>;
}

export type ViewQueryRefDictToViewQuerySyncableDict<T extends object> = {
  [TName in keyof T]: SyncableType<T[TName]>
};

export interface ResolvedViewQuery<T extends IViewQuery = IViewQuery> {
  syncables: ViewQueryRefDictToViewQuerySyncableDict<T['refs']>;
  options: T['options'];
}

export type ResolvedViewQueryType<TViewQuery> = TViewQuery extends IViewQuery
  ? ResolvedViewQuery<TViewQuery>
  : never;

export type ViewQueryResolvedSyncableDict<
  T extends IViewQuery
> = ViewQueryRefDictToViewQuerySyncableDict<T['refs']>;

export type ViewQueryDictToResolvedViewQueryDict<T extends object> = {
  [TName in keyof T]: T[TName] extends IViewQuery
    ? ResolvedViewQuery<T[TName]>
    : never
};
