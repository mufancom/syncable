import {
  AccessControlRuleSet,
  Context,
  Permission,
  Resource,
  ResourceRef,
  SyncableRequisiteAssociation,
} from '@syncable/core';

export abstract class ServerContext<
  User extends Resource = Resource
> extends Context<User> {
  constructor(
    ruleSet: AccessControlRuleSet,
    protected permissions: Permission[],
  ) {
    super(ruleSet);
  }

  async setUser(ref: ResourceRef<User>): Promise<void> {
    this.user = await this.resolve(ref);
  }

  async resolve<T extends Resource>(ref: ResourceRef<T>): Promise<T> {
    let syncable = await this.ensureSyncable(ref);

    let dependencyRefs = (syncable.$associations || [])
      .filter(
        (association): association is SyncableRequisiteAssociation =>
          association.requisite,
      )
      .map(association => association.ref);

    for (let ref of dependencyRefs) {
      await this.resolve(ref);
    }

    return this.get(ref)!;
  }

  async ensureSyncable<T extends Resource>(
    ref: ResourceRef<T>,
  ): Promise<T['syncable']> {}

  abstract async loadSyncable<T extends Resource>(
    ref: ResourceRef<T>,
  ): Promise<T['syncable']>;

  abstract async lock(...resources: ResourceRef[]): Promise<void>;
}
