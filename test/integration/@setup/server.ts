import {ChangePlantBlueprintGenericParams} from './changes';

export interface ServerGenericParams extends ChangePlantBlueprintGenericParams {
  viewQueryDict: object;
  customRPCDefinition: never;
}
