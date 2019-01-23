import {SyncableRef} from './syncable';
import {SyncableContainer} from './syncable-container';
import {ISyncableObject} from './syncable-object';

export interface ISyncableAdapterGenericParams {
  syncableObject: ISyncableObject;
  dependencyResolveOptions: unknown;
}

export interface ISyncableAdapter<
  TGenericParams extends ISyncableAdapterGenericParams = ISyncableAdapterGenericParams
> {
  instantiate(
    syncable: TGenericParams['syncableObject']['syncable'],
    container: SyncableContainer,
  ): TGenericParams['syncableObject'];

  resolveDependencyRefs(
    syncable: TGenericParams['syncableObject']['syncable'],
    options: TGenericParams['dependencyResolveOptions'],
  ): SyncableRef<TGenericParams['syncableObject']>[];
}
