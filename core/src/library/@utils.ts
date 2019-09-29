import produce from 'immer';

import {diff, patch} from './diff-patcher';

const _hasOwnProperty = Object.prototype.hasOwnProperty;

export function hasOwnProperty(
  object: object,
  name: string | number | symbol,
): boolean {
  return _hasOwnProperty.call(object, name);
}

export function replaceObject<T extends object>(target: T, replacement: T): T {
  let delta = diff(target, replacement);

  if (!delta) {
    return target;
  }

  return produce(target, source => {
    patch(source, delta!);
  });
}
