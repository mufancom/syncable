import {Syncable, SyncableObject} from '../syncable';
import {Context} from './context';

export abstract class SyncableObjectFactory {
  abstract create(
    syncable: Syncable,
    context: Context | undefined,
  ): SyncableObject;
}
