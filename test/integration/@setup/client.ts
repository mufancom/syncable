import {ChangePlantBlueprintGenericParams} from './changes';
import {ViewQuery} from './view-query';

export interface ClientGenericParams extends ChangePlantBlueprintGenericParams {
  viewQuery: ViewQuery;
  customRPCDefinition: never;
}
