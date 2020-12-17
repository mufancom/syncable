import _ from 'lodash';
import {computed} from 'mobx';

import {IContext} from '../context';

import {
  ACCESS_RIGHTS,
  AccessControlEntry,
  AccessControlEntryRuleName,
  AccessRight,
  SYNCABLE_ESSENTIAL_FIELD_NAMES,
  getAccessControlEntryPriority,
} from './access-control';
import {AccessControlRule} from './access-control-rule-decorator';
import {
  ISyncable,
  SyncableRef,
  getSyncableKey,
  getSyncableRef,
} from './syncable';
import {SyncableContainer} from './syncable-container';

export type AccessControlRuleTester = (
  context: IContext,
  options?: object,
) => boolean;

export interface AccessControlRuleEntry {
  test: AccessControlRuleTester;
}

type AccessDescriptor =
  | {
      allow: string[] | '*';
    }
  | {
      /** All other fields are accessible except for those denied. */
      deny: string[];
    };

type AccessRightToAccessDescriptorDict = {
  [TRight in AccessRight]: AccessDescriptor;
};

abstract class SyncableObject<T extends ISyncable = ISyncable> {
  /** @internal */
  // tslint:disable-next-line:variable-name
  __accessControlRuleMap!: Map<
    AccessControlEntryRuleName,
    AccessControlRuleEntry
  >;

  private _syncable: ISyncable | undefined;
  private _ref: SyncableRef;
  private _lastReferencedSyncable: ISyncable | undefined;

  constructor(syncable: T);
  constructor(
    refOrSyncable: SyncableRef<SyncableObject<T>> | T,
    _container: SyncableContainer,
  );
  constructor(
    refOrSyncable: ISyncable | SyncableRef,
    readonly container?: SyncableContainer,
  ) {
    if ('_type' in refOrSyncable) {
      this._syncable = refOrSyncable;
      this._ref = getSyncableRef(refOrSyncable);
    } else {
      this._ref = refOrSyncable;
    }
  }

  @computed
  get syncable(): T {
    if (this._syncable) {
      return this._syncable as T;
    } else {
      let syncable = this.requiredContainer.getSyncable(this._ref) as
        | T
        | undefined;

      if (!syncable) {
        console.warn(
          `Syncable (${JSON.stringify(
            this._ref,
          )}) no longer exists, you might have tried to access a syncable no longer available`,
          this,
        );

        return this._lastReferencedSyncable as T;
      }

      this._lastReferencedSyncable = syncable;

      return syncable;
    }
  }

  get id(): T['_id'] {
    return this.syncable._id;
  }

  get ref(): SyncableRef<this> {
    return getSyncableRef(this.syncable);
  }

  get key(): string {
    return getSyncableKey(this.syncable);
  }

  @computed
  get createdAt(): Date {
    return new Date(this.syncable._createdAt);
  }

  @computed
  get updatedAt(): Date {
    return new Date(this.syncable._updatedAt);
  }

  private get requiredContainer(): SyncableContainer {
    let container = this.container;

    if (!container) {
      throw new Error('The operation requires `manager` to present');
    }

    return container;
  }

  /**
   * Override to specify.
   */
  resolveRequisiteDependencyRefs(_changeType?: string): SyncableRef[] {
    return [];
  }

  /**
   * Override to specify.
   */
  resolveDependencyRefs(): SyncableRef[] {
    return [];
  }

  require<T extends ISyncableObject>(ref: SyncableRef<T>): T;
  require(ref: SyncableRef): ISyncableObject {
    return this.requiredContainer.requireSyncableObject(ref);
  }

  get<T extends ISyncableObject>(ref: SyncableRef<T>): T | undefined;
  get(ref: SyncableRef): ISyncableObject | undefined {
    return this.requiredContainer.getSyncableObject(ref);
  }

  getSyncableOverrides(): Partial<T> {
    return {};
  }

  getSanitizedSyncableOverrides(context: IContext): Partial<T> {
    return _.pick(
      this.getSyncableOverrides(),
      this.getSanitizedFieldNames(context),
    );
  }

  getSanitizedFieldNames(context: IContext): string[] {
    let whitelistedFieldNameSet = new Set([
      ...this.getSecuringFieldNames(),
      ...this.getEssentialFieldNames(),
      ...SYNCABLE_ESSENTIAL_FIELD_NAMES,
    ]);

    let {read: descriptor} = this.getAccessRightToAccessDescriptorDict(context);

    return Object.keys(this.syncable).filter(
      fieldName =>
        !whitelistedFieldNameSet.has(fieldName) &&
        !testAccessDescriptor(descriptor, [fieldName]),
    );
  }

  /**
   * Override to specify.
   */
  getSecuringFieldNames(): string[] {
    return [];
  }

  /**
   * Override to specify.
   */
  getEssentialFieldNames(): string[] {
    return [];
  }

  /**
   * Override to specify.
   */
  getDefaultACL(): AccessControlEntry[] {
    return [];
  }

  /**
   * Get ACL with descending priorities
   */
  getACL(): AccessControlEntry[] {
    let {_acl = []} = this.syncable;

    let defaultACL = this.getDefaultACL();

    return _.sortBy(
      // The original default ACL and ACL are written with ascending priorities
      // (the later one overrides the former one), so we do a reverse here
      // before the stable sort.
      _.uniqBy([...defaultACL, ..._acl], entry => entry.name).reverse(),
      entry => -getAccessControlEntryPriority(entry),
    );
  }

  getAccessRights(context: IContext, fieldNames?: string[]): AccessRight[] {
    if (!fieldNames) {
      return this.getObjectAccessRights(context);
    }

    let {_sanitizedFieldNames: sanitizedFieldNames} = this.syncable;

    if (
      sanitizedFieldNames &&
      _.intersection(fieldNames, sanitizedFieldNames).length > 0
    ) {
      return [];
    }

    let accessRightToAccessDescriptorDict = this.getAccessRightToAccessDescriptorDict(
      context,
      fieldNames,
    );

    return ACCESS_RIGHTS.filter(right =>
      testAccessDescriptor(
        accessRightToAccessDescriptorDict[right],
        fieldNames,
      ),
    );
  }

  testAccessRights(
    rights: AccessRight[],
    context: IContext,
    fieldNames?: string[],
  ): boolean {
    let grantedRights = this.getAccessRights(context, fieldNames);

    return _.difference(rights, grantedRights).length === 0;
  }

  validateAccessRights(
    rights: AccessRight[],
    context: IContext,
    fieldNames?: string[],
  ): void {
    let grantedRights = this.getAccessRights(context, fieldNames);

    if (_.difference(rights, grantedRights).length === 0) {
      return;
    }

    throw new Error(
      `Granted access rights ${
        fieldNames ? `for fields [${fieldNames.join(', ')}]` : ''
      } (${grantedRights.join(', ')}) do not match requirements (${rights.join(
        ', ',
      )})`,
    );
  }

  @AccessControlRule('basic')
  protected testBasic(): boolean {
    return true;
  }

  private getObjectAccessRights(context: IContext): AccessRight[] {
    let objectACL = this.getACL()
      .filter(ace => !('fields' in ace))
      .reverse();

    if (!objectACL.length) {
      return [...ACCESS_RIGHTS];
    }

    let grantedAccessRights: AccessRight[] = [];

    for (let entry of objectACL) {
      let {type, rights} = entry;

      // Test whether the entry can mutate the granted rights to avoid
      // unnecessary `testAccessControlEntry` calls
      if (type === 'allow') {
        if (_.difference(rights, grantedAccessRights).length === 0) {
          continue;
        }
      } else {
        if (_.intersection(grantedAccessRights, rights).length === 0) {
          continue;
        }
      }

      if (!this.testAccessControlEntry(entry, context)) {
        continue;
      }

      if (type === 'allow') {
        grantedAccessRights = _.union(grantedAccessRights, rights);
      } else {
        grantedAccessRights = _.difference(grantedAccessRights, rights);
      }
    }

    return grantedAccessRights;
  }

  private getAccessRightToAccessDescriptorDict(
    context: IContext,
    fieldNames?: string[],
  ): AccessRightToAccessDescriptorDict {
    let objectAccessRights = this.getObjectAccessRights(context);

    let accessRightToAccessDescriptorDict: AccessRightToAccessDescriptorDict = {
      read: objectAccessRights.includes('read') ? {allow: '*'} : {allow: []},
      write: objectAccessRights.includes('write') ? {allow: '*'} : {allow: []},
      full: objectAccessRights.includes('full') ? {allow: '*'} : {allow: []},
    };

    let acl = this.getACL().reverse();

    for (let entry of acl) {
      let aceFieldNames: string[] | '*';

      if ('fields' in entry && entry.fields) {
        aceFieldNames = fieldNames
          ? _.intersection(entry.fields, fieldNames)
          : entry.fields;

        if (!aceFieldNames.length) {
          continue;
        }
      } else {
        aceFieldNames = '*';
      }

      let overrides: Partial<AccessRightToAccessDescriptorDict> = {};

      let {type, rights} = entry;

      for (let right of rights) {
        let descriptor = accessRightToAccessDescriptorDict[right];

        if (type === 'allow') {
          // Allow

          if ('allow' in descriptor) {
            // Previously allow

            if (descriptor.allow === '*') {
              // Do nothing
            } else {
              if (aceFieldNames === '*') {
                overrides[right] = {
                  allow: '*',
                };
              } else {
                let updatedAllow = _.union(descriptor.allow, aceFieldNames);

                if (updatedAllow.length > descriptor.allow.length) {
                  overrides[right] = {
                    allow: updatedAllow,
                  };
                }
              }
            }
          } else {
            // Previously deny

            if (aceFieldNames === '*') {
              overrides[right] = {
                allow: '*',
              };
            } else {
              let updatedDeny = _.difference(descriptor.deny, aceFieldNames);

              if (!updatedDeny.length) {
                overrides[right] = {
                  allow: '*',
                };
              } else if (updatedDeny.length < descriptor.deny.length) {
                overrides[right] = {
                  deny: updatedDeny,
                };
              }
            }
          }
        } else {
          // Deny

          if ('allow' in descriptor) {
            // Previously allow

            if (descriptor.allow === '*') {
              if (aceFieldNames === '*') {
                overrides[right] = {
                  allow: [],
                };
              } else {
                overrides[right] = {
                  deny: aceFieldNames,
                };
              }
            } else {
              if (aceFieldNames === '*') {
                overrides[right] = {
                  allow: [],
                };
              } else {
                let updatedAllow = _.difference(
                  descriptor.allow,
                  aceFieldNames,
                );

                if (updatedAllow.length < descriptor.allow.length) {
                  overrides[right] = {
                    allow: updatedAllow,
                  };
                }
              }
            }
          } else {
            // Previously deny

            if (aceFieldNames === '*') {
              // Do nothing
            } else {
              let updatedDeny = _.union(descriptor.deny, aceFieldNames);

              if (updatedDeny.length > descriptor.deny.length) {
                overrides[right] = {
                  deny: updatedDeny,
                };
              }
            }
          }
        }
      }

      if (Object.keys(overrides).length === 0) {
        continue;
      }

      if (this.testAccessControlEntry(entry, context)) {
        Object.assign(accessRightToAccessDescriptorDict, overrides);
      }
    }

    return accessRightToAccessDescriptorDict;
  }

  private testAccessControlEntry(
    entry: AccessControlEntry,
    context: IContext,
  ): boolean {
    let {rule: ruleName, options} = entry;

    let rule = this.__accessControlRuleMap.get(ruleName);

    if (!rule) {
      throw new Error(`Unknown access control rule "${ruleName}"`);
    }

    return rule.test.call(this, context, options);
  }
}

export interface ISyncableObject<T extends ISyncable = ISyncable>
  extends SyncableObject<T> {}

export const AbstractSyncableObject = SyncableObject;

function testAccessDescriptor(
  descriptor: AccessDescriptor,
  fieldNames: string[],
): boolean {
  if ('allow' in descriptor) {
    return (
      descriptor.allow === '*' ||
      _.difference(fieldNames, descriptor.allow).length === 0
    );
  } else {
    return _.intersection(descriptor.deny, fieldNames).length === 0;
  }
}
