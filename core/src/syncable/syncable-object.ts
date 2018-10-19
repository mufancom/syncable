import _ from 'lodash';

import {
  ACCESS_RIGHTS,
  AccessControlEntry,
  AccessControlEntryRuleName,
  AccessControlEntryType,
  AccessRight,
  Permission,
  SecuringAccessControlEntry,
  getAccessControlEntryPriority,
} from '../access-control';
import {AccessControlRuleTester, Context} from '../context';

import {AccessControlRule} from './access-control-rule-decorator';
import {ISyncable, SyncableRef} from './syncable';
import {SyncableManager} from './syncable-manager';

export interface AccessControlRuleEntry {
  test: AccessControlRuleTester;
}

export interface GetAssociationOptions<T extends AbstractSyncableObject> {
  name?: string;
  type?: T['syncable']['_type'];
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

export abstract class AbstractSyncableObject<T extends ISyncable = ISyncable> {
  /** @internal */
  // tslint:disable-next-line:variable-name
  __accessControlRuleMap!: Map<
    AccessControlEntryRuleName,
    AccessControlRuleEntry
  >;

  constructor(readonly syncable: T, private _manager?: SyncableManager) {}

  get id(): T['_id'] {
    return this.syncable._id;
  }

  get ref(): SyncableRef<this> {
    let {_id: id, _type: type} = this.syncable;

    return {
      id,
      type,
    };
  }

  private get manager(): SyncableManager {
    let manager = this._manager;

    if (!manager) {
      throw new Error('The operation requires `manager` to present');
    }

    return manager;
  }

  require<T extends AbstractSyncableObject>(ref: SyncableRef<T>): T {
    return this.manager.requireSyncableObject(ref);
  }

  getGrantingPermissions(): Permission[] {
    return this.syncable._grants || [];
  }

  getSecuringACL(): SecuringAccessControlEntry[] {
    return (this.syncable._secures || []).filter(
      entry => entry.type === 'deny',
    );
  }

  getRequisiteAssociations<T extends AbstractSyncableObject>({
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

    let result = ACCESS_RIGHTS.filter(right => {
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

    return result;
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
  protected testBasic(
    _target: AbstractSyncableObject,
    _context: Context,
  ): boolean {
    return true;
  }

  private getAccessRightComparableItemsDict(
    context: Context,
  ): AccessRightComparableItemsDict {
    let dict: AccessRightComparableItemsDict = {
      read: [],
      write: [],
      full: [],
    };

    let acl = this.syncable._acl || [];

    if (acl.length) {
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
    } else {
      let item: AccessRightComparableItem = {
        type: 'allow',
        grantable: true,
        priority: 0,
      };

      for (let right of ACCESS_RIGHTS) {
        dict[right].push(item);
      }
    }

    let associations = this.getRequisiteAssociations();

    for (let association of associations) {
      let securingACL = association.getSecuringACL().filter(({match}) => {
        let refType = this.ref.type;

        if (!match || (match instanceof Array && !match.length)) {
          return true;
        }

        if (Array.isArray(match)) {
          let matches = match;
          let matched = true;

          for (let match of matches) {
            if (typeof match === 'string') {
              if (new RegExp(match).test(refType)) {
                matched = true;
              }
            } else {
              if (new RegExp(match.not).test(refType)) {
                matched = false;
              }
            }
          }

          return matched;
        } else {
          if (typeof match === 'string') {
            return new RegExp(match).test(refType);
          } else {
            return new RegExp(match.not).test(refType);
          }
        }

        // return !match || match.includes(this.ref.type);
      });

      for (let entry of securingACL) {
        let {type, grantable, rights} = entry;

        if (!association.testAccessControlEntry(this, entry, context)) {
          continue;
        }

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
      dict[right] = _.sortBy(dict[right], item => -item.priority);
    }

    return dict;
  }

  private testAccessControlEntry(
    target: AbstractSyncableObject,
    entry: AccessControlEntry,
    context: Context,
  ): boolean {
    let {rule: ruleName, options} = entry;

    let rule = this.__accessControlRuleMap.get(ruleName);

    if (!rule) {
      throw new Error(`Unknown access control rule "${ruleName}"`);
    }

    return rule.test.call(this, target, context, options);
  }
}
