import {ResolvedViewQuery, ViewQueryFilter} from '../connection-client';
import {IContext} from '../context';

import {SyncableContainer} from './syncable-container';
import {ISyncableObject} from './syncable-object';

export interface ISyncableAdapterGenericParams {
  context: IContext;
  syncableObject: ISyncableObject;
}

export interface ISyncableAdapter<
  TGenericParams extends ISyncableAdapterGenericParams = ISyncableAdapterGenericParams
> {
  instantiate(
    syncable: TGenericParams['syncableObject']['syncable'],
    container?: SyncableContainer,
  ): TGenericParams['syncableObject'];

  getViewQueryFilter(
    context: TGenericParams['context'],
    name: string,
    query: ResolvedViewQuery,
  ): ViewQueryFilter;
}
