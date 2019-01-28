import {
  ChangePlantTaskBlueprintGenericParams,
  TaskChange,
  taskBlueprint,
} from './task-changes';

export type Change = TaskChange;

export type ChangePlantBlueprintGenericParams = ChangePlantTaskBlueprintGenericParams;

export const blueprint = {
  ...taskBlueprint,
};

export * from './task-changes';
