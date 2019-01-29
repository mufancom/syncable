import {Dict} from 'tslang';
import uuid from 'uuid';

import {SyncableCreationRef} from './change';
import {SyncableRef} from './syncable';

export function generateUniqueId<T extends string>(): T {
  return uuid() as T;
}

export function getNonCreationRefsFromRefDict(
  refDict: Dict<SyncableRef | SyncableCreationRef>,
): SyncableRef[] {
  return Object.values(refDict).filter(
    (ref): ref is SyncableRef => !!ref && 'id' in ref,
  );
}
