import {ChangePlantBlueprintGenericParams} from './changes';
import {SyncableObject} from './syncables';

export interface ServerGenericParams extends ChangePlantBlueprintGenericParams {
  syncableObject: SyncableObject;
  viewQuery: object;
  customRPCDefinition: never;
}
