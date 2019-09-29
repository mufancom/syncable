import {ResolvedViewQuery, ViewQueryFilter} from '../connection-client';
import {IContext} from '../context';

import {SyncableRefType} from './syncable';
import {SyncableContainer} from './syncable-container';
import {ISyncableObject} from './syncable-object';

export interface ISyncableAdapterGenericParams {
  context: IContext;
  syncableObject: ISyncableObject;
}

export interface ISyncableAdapter<
  TGenericParams extends ISyncableAdapterGenericParams = ISyncableAdapterGenericParams
> {
  instantiateByRef(
    ref: SyncableRefType<TGenericParams['syncableObject']>,
    container: SyncableContainer,
  ): TGenericParams['syncableObject'] | undefined;

  instantiateBySyncable(
    syncable: TGenericParams['syncableObject']['syncable'],
  ): TGenericParams['syncableObject'];

  getViewQueryFilter(
    context: TGenericParams['context'],
    name: string,
    query: ResolvedViewQuery,
  ): ViewQueryFilter;
}
