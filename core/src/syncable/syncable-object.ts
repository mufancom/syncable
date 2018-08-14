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
import {SyncableManager} from './syncable-manager';

export interface AccessControlRuleEntry {
  test: AccessControlRuleTester;
}

export interface GetAssociationOptions<T extends SyncableObject> {
  name?: string;
  type?: T['type'];
  securesOnly?: boolean;
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
  __accessControlRuleMap!: Map<
    AccessControlEntryRuleName,
    AccessControlRuleEntry
  >;

  constructor(readonly syncable: T, protected manager: SyncableManager) {}

  get id(): T['_id'] {
    return this.syncable._id;
  }

  get type(): T['_type'] {
    return this.syncable._type;
  }

  get ref(): SyncableRef<this> {
    let {_id: id, _type: type} = this.syncable;

    return {
      id,
      type,
    };
  }

  getGrantingPermissions(): Permission[] {
    return this.syncable._grants || [];
  }

  getSecuringACL(): AccessControlEntry[] {
    return this.syncable._secures || [];
  }

  getRequisiteAssociations<T extends SyncableObject>({
    name,
    type,
    securesOnly = false,
  }: GetAssociationOptions<T> = {}): T[] {
    let associations = this.syncable._associations;

    if (!associations) {
      return [];
    }

    let manager = this.manager;

    return associations
      .filter(
        association =>
          association.requisite &&
          (!name || association.name === name) &&
          (!type || association.ref.type === type) &&
          (!securesOnly || association.secures),
      )
      .map(association => manager.requireSyncableObject(association.ref) as T);
  }

  getAccessRights(
    context: Context,
    {grantableOnly = false}: GetAccessRightsOptions = {},
  ): AccessRight[] {
    let accessRightsDict = this.getAccessRightComparableItemsDict(context);

    if (!accessRightsDict) {
      return [...ACCESS_RIGHTS];
    }

    return ACCESS_RIGHTS.filter(right => {
      let items = accessRightsDict![right];

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

  testAccessRights(
    rights: AccessRight[],
    context: Context,
    options?: GetAccessRightsOptions,
  ): boolean {
    let grantedRights = this.getAccessRights(context, options);

    return _.difference(rights, grantedRights).length === 0;
  }

  validateAccessRights(
    rights: AccessRight[],
    context: Context,
    options?: GetAccessRightsOptions,
  ): void {
    let grantedRights = this.getAccessRights(context, options);

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

  private getAccessRightComparableItemsDict(
    context: Context,
  ): AccessRightComparableItemsDict | undefined {
    let dict: AccessRightComparableItemsDict = {
      read: [],
      write: [],
      full: [],
    };

    let acl = this.syncable._acl || [];

    let hasNonEmptyACL = !!acl.length;

    for (let entry of acl) {
      if (!this.testAccessControlEntry(this, entry, context)) {
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

      hasNonEmptyACL = hasNonEmptyACL || !!securingACL.length;

      for (let entry of securingACL) {
        if (!association.testAccessControlEntry(this, entry, context)) {
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

    if (!hasNonEmptyACL) {
      return undefined;
    }

    for (let right of ACCESS_RIGHTS) {
      dict[right].sort((x, y) => y.priority - x.priority);
    }

    return dict;
  }

  private testAccessControlEntry(
    target: SyncableObject,
    entry: AccessControlEntry,
    context: Context,
  ): boolean {
    let {rule: ruleName, options} = entry;

    let rule = this.__accessControlRuleMap.get(ruleName);

    if (!rule) {
      throw new Error(`Unknown access control rule "${ruleName}"`);
    }

    return rule.test(target, context, options);
  }
}
