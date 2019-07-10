import _ from 'lodash';
import {computed} from 'mobx';

import {IContext} from '../context';

import {
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

    return _.uniqBy([...defaultACL, ..._acl], entry => entry.name).sort(
      (x, y) => {
        let xPriority = getAccessControlEntryPriority(x, false);
        let yPriority = getAccessControlEntryPriority(y, false);

        if (xPriority === yPriority) {
          return y.rights.length - x.rights.length;
        } else {
          return xPriority - yPriority;
        }
      },
    );
  }

  getAccessRights(context: IContext): AccessRight[] {
    let acl = this.getACL();

    if (!acl.length) {
      return ['full', 'read', 'write'];
    }

    let accessRightSet = new Set<AccessRight>();

    for (let entry of acl) {
      let {type, rights: currentRights} = entry;

      let existedAccessRights = Array.from(accessRightSet);

      if (
        (type === 'allow' &&
          !_.difference(currentRights, existedAccessRights).length) ||
        (type === 'deny' &&
          existedAccessRights.every(right => !currentRights.includes(right))) ||
        !this.testAccessControlEntry(entry, context)
      ) {
        continue;
      }

      for (let right of currentRights) {
        if (type === 'allow') {
          accessRightSet.add(right);
        } else {
          accessRightSet.delete(right);
        }
      }
    }

    return Array.from(accessRightSet);
  }

  testAccessRights(rights: AccessRight[], context: IContext): boolean {
    let grantedRights = this.getAccessRights(context);

    return _.difference(rights, grantedRights).length === 0;
  }

  validateAccessRights(rights: AccessRight[], context: IContext): void {
    let grantedRights = this.getAccessRights(context);

    if (_.difference(rights, grantedRights).length === 0) {
      return;
    }

    throw new Error(
      `Granted access rights (${grantedRights.join(
        ', ',
      )}) do not match requirements (${rights.join(', ')})`,
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
