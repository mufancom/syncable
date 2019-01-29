import {SyncableContainer} from './syncable-container';
import {ISyncableObject} from './syncable-object';

export interface ISyncableAdapterGenericParams {
  syncableObject: ISyncableObject;
}

export interface ISyncableAdapter<
  TGenericParams extends ISyncableAdapterGenericParams = ISyncableAdapterGenericParams
> {
  instantiate(
    syncable: TGenericParams['syncableObject']['syncable'],
    container?: SyncableContainer,
  ): TGenericParams['syncableObject'];
}
