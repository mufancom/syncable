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
