import {Permission} from '../access-control';
import {
  AccessControlRuleName,
  AccessControlRuleValidator,
  GetAssociationOptions,
  Syncable,
  SyncableId,
  SyncableObject,
  SyncableRef,
  SyncableRefType,
  UserSyncableObject,
} from '../syncable';

export function AccessControlRule<
  TargetSyncableObject extends SyncableObject = SyncableObject,
  Options extends object = object
>() {
  return (
    target: SyncableObject,
    name: string,
    descriptor: TypedPropertyDescriptor<
      AccessControlRuleValidator<TargetSyncableObject, Options>
    >,
  ) => {
    let validator = descriptor.value! as AccessControlRuleValidator<
      SyncableObject,
      object
    >;

    target.__accessControlRuleMap.set(name as AccessControlRuleName, {
      validator,
    });
  };
}

export abstract class Context<
  User extends UserSyncableObject = UserSyncableObject
> {
  protected user!: User;

  private syncableMap = new Map<SyncableId, Syncable>();

  get permissions(): Permission[] {
    return this.user.permissions;
  }

  abstract async resolve<T extends SyncableObject>(
    ref: SyncableRefType<T>,
  ): Promise<T>;

  get<T extends SyncableObject>(ref: SyncableRefType<T>): T | undefined {}

  require<T extends SyncableObject>(ref: SyncableRefType<T>): T {
    let object = this.get(ref);

    if (!object) {
      throw new Error(
        `SyncableObject "${JSON.stringify(ref)}" not added to context`,
      );
    }

    return object;
  }

  getRequisiteAssociations<T extends SyncableObject>(
    options: GetAssociationOptions<T> = {},
  ): T[] {
    return this.user.getRequisiteAssociations(options);
  }

  protected add(syncable: Syncable): void {
    this.syncableMap.set(syncable.id, syncable);
  }
}
