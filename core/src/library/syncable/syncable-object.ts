import _ from 'lodash';
import {computed} from 'mobx';

import {IContext} from '../context';

import {
  ACCESS_RIGHTS,
  AccessControlEntry,
  AccessControlEntryRuleName,
  AccessControlEntryType,
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

interface AccessRightComparableItem {
  type: AccessControlEntryType;
  priority: number;
}

type AccessRightComparableItemsDict = {
  [key in AccessRight]: AccessRightComparableItem[]
};

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
  resolveDependencyRefs(): SyncableRef[] {
    return [];
  }

  require<T extends ISyncableObject>(ref: SyncableRef<T>): T {
    return this.container.requireSyncableObject(ref);
  }

  get<T extends ISyncableObject>(ref: SyncableRef<T>): T | undefined {
    return this.container.getSyncableObject(ref);
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

    return Array.from(
      new Map(
        [...defaultACL, ..._acl].map(
          (entry): [string, AccessControlEntry] => [entry.name, entry],
        ),
      ).values(),
    );
  }

  getAccessRights(context: IContext): AccessRight[] {
    let dict: AccessRightComparableItemsDict = {
      read: [],
      write: [],
      full: [],
    };

    let acl = this.getACL();

    if (acl.length) {
      for (let entry of acl) {
        if (!this.testAccessControlEntry(entry, context)) {
          continue;
        }

        let {type, rights} = entry;

        let item: AccessRightComparableItem = {
          type,
          priority: getAccessControlEntryPriority(entry, false),
        };

        for (let right of rights) {
          dict[right].push(item);
        }
      }
    } else {
      let item: AccessRightComparableItem = {
        type: 'allow',
        priority: 0,
      };

      for (let right of ACCESS_RIGHTS) {
        dict[right].push(item);
      }
    }

    for (let right of ACCESS_RIGHTS) {
      dict[right] = _.sortBy(dict[right], item => -item.priority);
    }

    return ACCESS_RIGHTS.filter(right => {
      let {type} = _.maxBy(dict[right], item => item.priority)!;

      return type === 'allow';
    });
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
