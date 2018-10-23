import _ from 'lodash';

import {
  ACCESS_RIGHTS,
  AccessControlEntry,
  AccessControlEntryRuleName,
  AccessControlEntryType,
  AccessRight,
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

abstract class SyncableObject<T extends ISyncable = ISyncable> {
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

  require<T extends ISyncableObject>(ref: SyncableRef<T>): T {
    return this.manager.requireSyncableObject(ref);
  }

  getAssociatedObjects(securesOnly?: boolean): ISyncableObject[] {
    return this.manager.requireAssociatedSyncableObjects(
      this.syncable,
      securesOnly,
    );
  }

  getSecuringACL(
    nameToSecureMap: Map<string, SecuringAccessControlEntry> = new Map(),
  ): Map<string, SecuringAccessControlEntry> {
    let {syncable: {_extends, _secures}} = this;

    (_secures || [])
      .filter(entry => entry.type === 'deny')
      .forEach(secure => nameToSecureMap.set(secure.name, secure));

    if (_extends) {
      return this.getSecuringACL.call(
        this.require(_extends.ref),
        nameToSecureMap,
      );
    }

    return nameToSecureMap;
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
  protected testBasic(_target: ISyncableObject, _context: Context): boolean {
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
    let aclMap = new Map<string, AccessControlEntry>();

    let extended = this.syncable._extends;

    if (extended && extended.acl) {
      let {syncable: {_acl: extendedACL}} = this.require(extended.ref);

      if (extendedACL) {
        for (let ace of extendedACL) {
          aclMap.set(ace.name, ace);
        }
      }
    }

    for (let ace of acl) {
      aclMap.set(ace.name, ace);
    }

    if (aclMap.size) {
      for (let [, ace] of aclMap) {
        if (!this.testAccessControlEntry(this, ace, context)) {
          continue;
        }

        let {type, grantable, rights} = ace;

        let item: AccessRightComparableItem = {
          type,
          grantable,
          priority: getAccessControlEntryPriority(ace, false),
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

    let associatedObjects = this.getAssociatedObjects(true);

    for (let associatedObject of associatedObjects) {
      let securingACL = Array.from(
        associatedObject.getSecuringACL(),
        ([_name, ace]) => ace,
      ).filter(({match}) => {
        let refType = this.ref.type;

        if (!match) {
          return true;
        }

        if (Array.isArray(match) || typeof match === 'string') {
          let matches = _.castArray(match);

          for (let match of matches) {
            if (match === refType) {
              return true;
            }
          }

          return false;
        } else {
          let negativeMatches = _.castArray(match.not);

          for (const negativeMatch of negativeMatches) {
            if (negativeMatch === refType) {
              return false;
            }
          }

          return true;
        }
      });

      for (let entry of securingACL) {
        let {type, grantable, rights} = entry;

        if (!associatedObject.testAccessControlEntry(this, entry, context)) {
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
    target: ISyncableObject,
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

export interface ISyncableObject<T extends ISyncable = ISyncable>
  extends SyncableObject<T> {}

export const AbstractSyncableObject = SyncableObject;
