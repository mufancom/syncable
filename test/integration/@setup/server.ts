import {ChangePlantBlueprintGenericParams} from './changes';

export interface ServerGenericParams extends ChangePlantBlueprintGenericParams {
  viewQuery: object;
  customRPCDefinition: never;
}
