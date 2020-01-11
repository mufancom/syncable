import _ from 'lodash';
import {Dict} from 'tslang';
import uuid from 'uuid';

import {SyncableCreationRef} from './change';
import {SyncableRef} from './syncable';

export function generateUniqueId<T extends string>(): T {
  return uuid() as T;
}

export function getNonCreationRefsFromRefDict(
  refDict: Dict<SyncableRef | SyncableRef[] | SyncableCreationRef>,
): SyncableRef[] {
  return _.flatMap(Object.values(refDict), ref =>
    Array.isArray(ref) ? ref : ref && 'id' in ref ? [ref] : [],
  );
}

export function deepFreeze<T extends unknown>(value: T): void {
  if (!_.isObjectLike(value)) {
    return;
  }

  let propertyNames = Object.getOwnPropertyNames(value);

  for (let propertyName of propertyNames) {
    let propertyValue = (value as any)[propertyName];

    deepFreeze(propertyValue);
  }

  Object.freeze(value);
}
