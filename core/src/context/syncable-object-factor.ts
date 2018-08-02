import {SyncableObject} from '../syncable';
import {Context} from './context';

export abstract class SyncableObjectFactory<
  TSyncableObject extends SyncableObject = SyncableObject
> {
  abstract create<T extends TSyncableObject>(
    syncable: T['syncable'],
    context: Context,
  ): T;
}
