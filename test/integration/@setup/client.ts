import {ChangePlantBlueprintGenericParams} from './changes';
import {ViewQueryDict} from './view-query';

export interface ClientGenericParams extends ChangePlantBlueprintGenericParams {
  viewQueryDict: ViewQueryDict;
  customConnectionRPCDefinition: never;
}
