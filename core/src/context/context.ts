import {Permission} from '../permission';
import {
  AccessControlRuleName,
  AccessControlRuleValidator,
  GetAssociationOptions,
  SyncableObject,
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
}
