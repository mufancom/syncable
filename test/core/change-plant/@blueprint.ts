import {
  ChangePlantBlueprint,
  IChangePlantBlueprintGenericParams,
} from '@syncable/core';

import {Change} from './@changes';

export interface ChangePlantBlueprintGenericParams
  extends IChangePlantBlueprintGenericParams {
  change: Change;
}

export const blueprint: ChangePlantBlueprint<
  ChangePlantBlueprintGenericParams
> = {
  'task:update-task-brief'({task}, {}, {options: {brief}}) {
    task.brief = brief;
  },
};
