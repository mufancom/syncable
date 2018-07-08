import {
  AccessControlRuleSet,
  Context,
  Permission,
  Resource,
  ResourceRef,
  SyncableRequisiteAssociation,
} from '@syncable/core';

export abstract class ClientContext<
  User extends Resource = Resource
> extends Context<User> {
  constructor(ruleSet: AccessControlRuleSet) {
    super(ruleSet);
  }

  setUser(ref: ResourceRef<User>): void {
    this.user = this.require(ref);
  }
}
