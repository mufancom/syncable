import {ChangePlantBlueprintGenericParams} from './changes';
import {SyncableObject} from './syncables';
import {ViewQuery} from './view-query';

export interface ClientGenericParams extends ChangePlantBlueprintGenericParams {
  syncableObject: SyncableObject;
  viewQuery: ViewQuery;
  customRPCDefinition: never;
}
