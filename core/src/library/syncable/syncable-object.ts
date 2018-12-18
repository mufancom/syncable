import _ from 'lodash';
import {computed} from 'mobx';

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
import {getSyncableKey, getSyncableRef} from '../utils';

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
    return getSyncableRef(this.syncable);
  }

  get key(): string {
    return getSyncableKey(this.syncable);
  }

  get super(): this | undefined {
    let {_extends} = this.syncable;

    return _extends && this.require<this>(_extends.ref);
  }

  @computed
  get createdAt(): Date {
    return new Date(this.syncable._createdAt);
  }

  @computed
  get updatedAt(): Date {
    return new Date(this.syncable._updatedAt);
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

  getDefaultACL(): AccessControlEntry[] {
    return [];
  }

  getSecuringFieldNames(): string[] {
    return [];
  }

  getACL(): AccessControlEntry[] {
    let {_extends, _acl = []} = this.syncable;

    let superACL: AccessControlEntry[] = [];

    if (_extends && _extends.acl) {
      let superObject = this.require(_extends.ref);
      superACL = superObject.getACL();
    }

    let defaultACL = this.getDefaultACL();

    return Array.from(
      new Map(
        [...superACL, ...defaultACL, ..._acl].map(
          (entry): [string, AccessControlEntry] => [entry.name, entry],
        ),
      ).values(),
    );
  }

  getSecuringACL(): SecuringAccessControlEntry[] {
    let {_extends, _secures = []} = this.syncable;

    let superSecuringEntries: SecuringAccessControlEntry[] = [];

    if (_extends && _extends.secures) {
      let superObject = this.require(_extends.ref);
      superSecuringEntries = superObject.getSecuringACL();
    }

    return Array.from(
      new Map(
        [...superSecuringEntries, ..._secures].map(
          (entry): [string, SecuringAccessControlEntry] => [entry.name, entry],
        ),
      ).values(),
    );
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

    let acl = this.getACL();

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

    let associatedObjects = this.getAssociatedObjects(true);
    let type = this.ref.type;

    for (let associatedObject of associatedObjects) {
      let securingACL = associatedObject.getSecuringACL().filter(({match}) => {
        if (!match) {
          return true;
        }

        if (Array.isArray(match) || typeof match === 'string') {
          let matches = Array.isArray(match) ? match : [match];

          return matches.some(match => match === type);
        } else {
          let {not} = match;
          let negativeMatches = Array.isArray(not) ? not : [not];

          return negativeMatches.some(negativeMatch => negativeMatch !== type);
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
