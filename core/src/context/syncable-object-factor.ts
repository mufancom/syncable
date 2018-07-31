import {SyncableObject} from '../syncable';
import {Context} from './context';

export abstract class SyncableObjectFactory {
  abstract create<T extends SyncableObject>(
    syncable: T['syncable'],
    context: Context,
  ): T;
}
