import {
  AccessControlRuleSet,
  Context,
  Permission,
  Resource,
  ResourceRef,
  ResourceSyncableRequisiteAssociation,
} from '@syncable/core';

export abstract class ServerContext<User extends Resource> extends Context<
  User
> {
  constructor(
    ruleSet: AccessControlRuleSet,
    protected permissions: Permission[],
  ) {
    super(ruleSet);
  }

  async resolveUser(ref: ResourceRef<User>): Promise<void> {
    this.user = await this.resolve(ref);
  }

  async resolve<T extends Resource>(ref: ResourceRef<T>): Promise<T> {
    let syncable = await this.getSyncable(ref);

    let dependencyRefs = (syncable.$associations || [])
      .filter(
        (association): association is ResourceSyncableRequisiteAssociation =>
          association.requisite,
      )
      .map(association => association.ref);
  }

  async getSyncable<T extends Resource>(
    ref: ResourceRef<T>,
  ): Promise<T['syncable']> {}

  abstract async loadSyncable<T extends Resource>(
    ref: ResourceRef<T>,
  ): Promise<T['syncable']>;
}
