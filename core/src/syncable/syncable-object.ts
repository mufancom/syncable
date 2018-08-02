import _ = require('lodash');

import {
  ACCESS_RIGHTS,
  AccessControlEntry,
  AccessControlEntryRuleName,
  AccessControlEntryType,
  AccessRight,
  Permission,
  getAccessControlEntryPriority,
} from '../access-control';
import {AccessControlRuleTester, Context} from '../context';
import {AccessControlRule} from './access-control-rule-decorator';
import {Syncable, SyncableRef} from './syncable';

export interface AccessControlRuleEntry {
  test: AccessControlRuleTester;
}

export interface GetAssociationOptions {
  name?: string;
  type?: string;
}

export interface GetAccessRightsOptions {
  grantableOnly?: boolean;
}

interface AccessRightComparableItem {
  type: AccessControlEntryType;
  grantable: boolean;
  priority: number;
}

type AccessRightComparableItemsDict = {
  [key in AccessRight]: AccessRightComparableItem[]
};

export abstract class SyncableObject<T extends Syncable = Syncable> {
  /** @internal */
  // tslint:disable-next-line:variable-name
  __accessControlRuleMap = new Map<
    AccessControlEntryRuleName,
    AccessControlRuleEntry
  >();

  constructor(readonly syncable: T, protected context?: Context) {}

  get id(): T['$id'] {
    return this.syncable.$id;
  }

  get type(): T['$type'] {
    return this.syncable.$type;
  }

  get ref(): SyncableRef<this> {
    let {$id: id, $type: type} = this.syncable;

    return {
      id,
      type,
    };
  }

  getGrantingPermissions(): Permission[] {
    return this.syncable.$grants || [];
  }

  getSecuringACL(): AccessControlEntry[] {
    return this.syncable.$secures || [];
  }

  getRequisiteAssociations(
    {name, type}: GetAssociationOptions = {},
    context?: Context,
  ): SyncableObject[] {
    let associations = this.syncable.$associations;

    if (!associations) {
      return [];
    }

    context = this.requireContext(context);

    return associations
      .filter(
        association =>
          association.requisite &&
          (!name || association.name === name) &&
          (!type || association.ref.type === type),
      )
      .map(association => context!.require(association.ref));
  }

  getAccessRights({
    grantableOnly = false,
  }: GetAccessRightsOptions = {}): AccessRight[] {
    let accessRightsDict = this.getAccessRightComparableItemsDict();

    return ACCESS_RIGHTS.filter(right => {
      let items = accessRightsDict[right];

      for (let {type, grantable} of items) {
        if (type !== 'allow') {
          break;
        }

        if (!grantableOnly || grantable) {
          return true;
        }
      }

      return false;
    });
  }

  validateAccessRights(
    rights: AccessRight[],
    options?: GetAccessRightsOptions,
  ): void {
    let grantedRights = this.getAccessRights(options);

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
  protected testBasic(_target: SyncableObject, _context: Context): boolean {
    return true;
  }

  private getAccessRightComparableItemsDict(): AccessRightComparableItemsDict {
    let dict: AccessRightComparableItemsDict = {
      read: [],
      write: [],
      delete: [],
      associate: [],
    };

    let acl = this.syncable.$acl || [];

    for (let entry of acl) {
      if (!this.testAccessControlEntry(this, entry)) {
        continue;
      }

      let {type, grantable, rights} = entry;

      let item: AccessRightComparableItem = {
        type,
        grantable,
        priority: getAccessControlEntryPriority(entry, false),
      };

      for (let right of rights) {
        dict[right].push(item);
      }
    }

    let associations = this.getRequisiteAssociations();

    for (let association of associations) {
      let securingACL = association.getSecuringACL();

      for (let entry of securingACL) {
        if (!association.testAccessControlEntry(this, entry)) {
          continue;
        }

        let {type, grantable, rights} = entry;

        let item: AccessRightComparableItem = {
          type,
          grantable,
          priority: getAccessControlEntryPriority(entry, true),
        };

        for (let right of rights) {
          dict[right].push(item);
        }
      }
    }

    for (let right of ACCESS_RIGHTS) {
      dict[right].sort((x, y) => y.priority - x.priority);
    }

    return dict;
  }

  private testAccessControlEntry(
    target: SyncableObject,
    entry: AccessControlEntry,
    context?: Context,
  ): boolean {
    let {rule: ruleName, options} = entry;

    let rule = this.__accessControlRuleMap.get(ruleName);

    if (!rule) {
      throw new Error(`Unknown access control rule "${ruleName}"`);
    }

    return rule.test(target, this.requireContext(context), options);
  }

  private requireContext(context = this.context): Context {
    if (!context) {
      throw new Error(
        'Context is neither available from parameter nor the instance',
      );
    }

    return context;
  }
}
