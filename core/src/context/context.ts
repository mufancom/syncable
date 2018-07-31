import {Permission} from '../access-control';
import {RefDictToObjectDict} from '../change';
import {Dict} from '../lang';
import {
  GetAssociationOptions,
  Syncable,
  SyncableId,
  SyncableObject,
  SyncableRef,
  UserSyncableObject,
} from '../syncable';
import {SyncableObjectFactory} from './syncable-object-factor';

export type AccessControlRuleTester = (
  target: SyncableObject,
  context: Context,
  options?: object,
) => boolean;

export abstract class Context<
  TUser extends UserSyncableObject = UserSyncableObject
> {
  protected user!: TUser;

  private syncableMap = new Map<SyncableId, Syncable>();
  private syncableObjectMap = new WeakMap<Syncable, SyncableObject>();

  constructor(protected syncableObjectFactory: SyncableObjectFactory) {}

  get permissions(): Permission[] {
    return this.user.permissions;
  }

  addSyncable(syncable: Syncable): void {
    this.syncableMap.set(syncable.$id, syncable);
  }

  getSyncable<T extends SyncableObject>({
    id,
  }: SyncableRef<T>): T['syncable'] | undefined {
    return this.syncableMap.get(id);
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
    let syncable = this.getSyncable(ref);

    if (!syncable) {
      return undefined;
    }

    let syncableObjectMap = this.syncableObjectMap;

    let object = syncableObjectMap.get(syncable) as T | undefined;

    if (!object) {
      object = this.syncableObjectFactory.create<T>(syncable, this);
      syncableObjectMap.set(syncable, object);
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
