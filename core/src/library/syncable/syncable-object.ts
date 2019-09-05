import _ from 'lodash';
import {computed} from 'mobx';

import {IContext} from '../context';

import {
  ACCESS_RIGHTS,
  AccessControlEntry,
  AccessControlEntryRuleName,
  AccessRight,
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

abstract class SyncableObject<T extends ISyncable = ISyncable> {
  /** @internal */
  // tslint:disable-next-line:variable-name
  __accessControlRuleMap!: Map<
    AccessControlEntryRuleName,
    AccessControlRuleEntry
  >;

  constructor(readonly syncable: T, private _container?: SyncableContainer) {}

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

  private get container(): SyncableContainer {
    let container = this._container;

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
    return this.container.requireSyncableObject(ref);
  }

  get<T extends ISyncableObject>(ref: SyncableRef<T>): T | undefined;
  get(ref: SyncableRef): ISyncableObject | undefined {
    return this.container.getSyncableObject(ref);
  }

  /**
   * Override to specify.
   */
  getSanitizedFieldNames(_context: IContext): string[] {
    return [];
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
  getDefaultACL(): AccessControlEntry[] {
    return [];
  }

  getACL(): AccessControlEntry[] {
    let {_acl = []} = this.syncable;

    let defaultACL = this.getDefaultACL();

    return _.sortBy(
      _.uniqBy([..._acl, ...defaultACL], entry => entry.name),
      entry => getAccessControlEntryPriority(entry),
    );
  }

  getAccessRights(
    context: IContext,
    testingFieldNames?: string[],
  ): AccessRight[] {
    let acl = this.getACL();
    let objectACL = acl.filter(ace => !ace.fields);
    let fieldsACL = acl.filter(ace => !!ace.fields);

    let adjustAccessRights = (
      entry: AccessControlEntry,
      grantedAccessRightSet: Set<AccessRight>,
      context: IContext,
    ): void => {
      let {type, rights} = entry;
      let grantedAccessRights = Array.from(grantedAccessRightSet);

      if (type === 'allow') {
        if (
          !_.difference(rights, grantedAccessRights).length ||
          !this.testAccessControlEntry(entry, context)
        ) {
          return;
        }

        for (let right of rights) {
          grantedAccessRightSet.add(right);
        }
      } else if (type === 'deny') {
        if (
          !_.intersection(grantedAccessRights, rights).length ||
          !this.testAccessControlEntry(entry, context)
        ) {
          return;
        }

        for (let right of rights) {
          grantedAccessRightSet.delete(right);
        }
      }
    };

    if (!acl.length) {
      return [...ACCESS_RIGHTS];
    }

    let objectAccessRightSet = new Set<AccessRight>();

    for (let entry of objectACL) {
      adjustAccessRights(entry, objectAccessRightSet, context);
    }

    if (!testingFieldNames) {
      return Array.from(objectAccessRightSet);
    }

    let fieldNameToAccessRightSetMap: Map<string, Set<AccessRight>> = new Map<
      string,
      Set<AccessRight>
    >(
      testingFieldNames.map(
        fieldName =>
          [fieldName, new Set(objectAccessRightSet)] as [
            string,
            Set<AccessRight>
          ],
      ),
    );

    for (let entry of fieldsACL) {
      let {fields: fieldNames} = entry;

      let fieldsToTest = _.intersection(testingFieldNames, fieldNames!);

      for (let fieldName of fieldsToTest) {
        adjustAccessRights(
          entry,
          fieldNameToAccessRightSetMap.get(fieldName)!,
          context,
        );
      }
    }

    return _.intersection(
      ...Array.from(fieldNameToAccessRightSetMap.values()).map(set =>
        Array.from(set),
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
        fieldNames ? `for field [${fieldNames.join(', ')}]` : ''
      } (${grantedRights.join(', ')}) do not match requirements (${rights.join(
        ', ',
      )})`,
    );
  }

  @AccessControlRule('basic')
  protected testBasic(): boolean {
    return true;
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
