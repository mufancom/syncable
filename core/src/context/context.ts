import {Permission} from '../access-control';
import {
  AccessControlRuleName,
  AccessControlRuleValidator,
  GetAssociationOptions,
  Syncable,
  SyncableObject,
  SyncableRefType,
  SyncableRef,
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

export class Context<User extends SyncableObject = SyncableObject> {
  private user: User;

  constructor() {}

  // get associations(): SyncableObject[] {
  //   throw new Error('Not implemented');
  // }

  get grantedPermissions(): Permission[] {
    throw new Error('Not implemented');
  }

  getRequisiteAssociations<T extends SyncableObject>(
    options?: GetAssociationOptions<T>,
  ): T[] {
    return this.user.getRequisiteAssociations(options);
  }

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
}
