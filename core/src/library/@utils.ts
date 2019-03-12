import {ObjectReplacer, ReplaceableType} from 'replace-object';

import {ISyncable} from './syncable';

const _hasOwnProperty = Object.prototype.hasOwnProperty;

export function hasOwnProperty(
  object: object,
  name: string | number | symbol,
): boolean {
  return _hasOwnProperty.call(object, name);
}

class SyncableReplacer extends ObjectReplacer {
  protected isSameReplaceableType(x: any, y: any): ReplaceableType | false {
    let type = super.isSameReplaceableType(x, y);

    if (type !== 'object' || x.id === y.id) {
      return type;
    }

    return false;
  }
}

const syncableReplacer = new SyncableReplacer();

export function replaceSyncable(
  syncable: ISyncable,
  snapshot: ISyncable,
): void {
  syncableReplacer.replace(syncable, snapshot);
}
