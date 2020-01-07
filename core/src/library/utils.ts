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

export function deepFreeze<TObject extends object>(object: TObject): TObject {
  let names = Object.getOwnPropertyNames(object);

  for (let name of names) {
    let prop = (object as any)[name];

    if (typeof prop !== 'object' || prop === null) {
      continue;
    }

    deepFreeze(prop);
  }

  Object.freeze(object);

  return object;
}
