import {Permission} from '../access-control';
import {
  GetAssociationOptions,
  Syncable,
  SyncableObject,
  SyncableRef,
  UserSyncableObject,
} from '../syncable';
import {ContextCache} from './context-cache';
import {SyncableObjectFactory} from './syncable-object-factor';

export type AccessControlRuleTester = (
  target: SyncableObject,
  context: Context,
  options?: object,
) => boolean;

export abstract class Context<
  TUser extends UserSyncableObject = UserSyncableObject,
  TQuery = any
> {
  protected user!: TUser;

  protected query: TQuery | undefined;

  constructor(
    protected cache: ContextCache,
    protected factory: SyncableObjectFactory,
  ) {}

  get permissions(): Permission[] {
    return this.user.permissions;
  }

  async updateQuery(query: TQuery): Promise<void> {
    this.query = query;
  }

  addSyncable(syncable: Syncable): void {
    this.cache.addSyncable(syncable);
  }

  /**
   * Update a syncable stored in context, please notice that it won't change
   * the reference of the originally stored syncable. Instead, differences will
   * be applied to it.
   */
  updateSyncable(snapshot: Syncable): void {
    this.cache.updateSyncable(snapshot);
  }

  removeSyncable(ref: SyncableRef): void {
    this.cache.removeSyncable(ref);
  }

  getSyncable<T extends SyncableObject>(
    ref: SyncableRef<T>,
  ): T['syncable'] | undefined {
    return this.cache.getSyncable(ref);
  }

  requireSyncable<T extends SyncableObject>(
    ref: SyncableRef<T>,
  ): T['syncable'] {
    let syncable = this.getSyncable(ref);

    if (!syncable) {
      throw new Error(`Syncable "${JSON.stringify(ref)}" not added to context`);
    }

    return syncable;
  }

  get<T extends SyncableObject>(ref: SyncableRef<T>): T | undefined {
    let cache = this.cache;

    let object = cache.getSyncableObject(ref) as T | undefined;

    if (!object) {
      let syncable = cache.getSyncable(ref);

      if (!syncable) {
        return undefined;
      }

      object = this.factory.create<T>(syncable, this);
      cache.setSyncableObject(ref, object);
    }

    return object;
  }

  require<T extends SyncableObject>(ref: SyncableRef<T>): T {
    let object = this.get(ref);

    if (!object) {
      throw new Error(`Syncable "${JSON.stringify(ref)}" not added to context`);
    }

    return object;
  }

  getRequisiteAssociations(
    options: GetAssociationOptions = {},
  ): SyncableObject[] {
    return this.user.getRequisiteAssociations(options);
  }
}
