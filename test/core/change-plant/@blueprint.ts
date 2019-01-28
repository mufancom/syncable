import {
  ChangePlantBlueprint,
  IChangePlantBlueprintGenericParams,
} from '@syncable/core';

import {Change} from './@changes';
import {SyncableDependencyResolveOptions} from './@types';

export interface ChangePlantBlueprintGenericParams
  extends IChangePlantBlueprintGenericParams {
  change: Change;
  dependencyResolveOptions: SyncableDependencyResolveOptions;
}

export const blueprint: ChangePlantBlueprint<
  ChangePlantBlueprintGenericParams
> = {
  'task:update-task-brief'({task}, {}, {options: {brief}}) {
    task.brief = brief;
  },
};
