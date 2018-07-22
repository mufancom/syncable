import _ = require('lodash');

import {
  ACCESS_RIGHTS,
  AccessControlEntry,
  AccessControlEntryName,
  AccessControlEntryType,
  AccessRight,
  Permission,
  getAccessControlEntryPriority,
} from '../access-control';
import {Context} from '../context';
import {Syncable} from './syncable';

export type AccessControlRuleTester<
  TContext extends Context,
  Options extends object
> = (target: SyncableObject, context: TContext, options?: Options) => boolean;

export interface AccessControlRuleEntry<
  TContext extends Context = Context,
  Options extends object = object
> {
  test: AccessControlRuleTester<TContext, Options>;
}

export interface GetAssociationOptions<T extends SyncableObject> {
  name?: string;
  type?: T['type'];
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
    AccessControlEntryName,
    AccessControlRuleEntry
  >();

  constructor(readonly syncable: T, protected context: Context) {}

  get id(): T['id'] {
    return this.syncable.id;
  }

  get type(): T['type'] {
    return this.syncable.type;
  }

  getGrantingPermissions(): Permission[] {
    return this.syncable.$grants || [];
  }

  getSecuringACL(): AccessControlEntry[] {
    return this.syncable.$secures || [];
  }

  getRequisiteAssociations<T extends SyncableObject>(
    _options: GetAssociationOptions<T> = {},
  ): T[] {
    let associations = this.syncable.$associations;

    if (!associations) {
      return [];
    }

    let context = this.context;

    return associations
      .filter(association => association.requisite)
      .map(association =>
        context.require<SyncableObject>(association.ref),
      ) as T[];
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

  private getAccessRightComparableItemsDict(): AccessRightComparableItemsDict {
    let dict: AccessRightComparableItemsDict = {
      read: [],
      write: [],
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
  ): boolean {
    if (!('name' in entry)) {
      return true;
    }

    let {name, options} = entry;

    let rule = this.__accessControlRuleMap.get(name);

    if (!rule) {
      throw new Error(`Unknown access control rule "${name}"`);
    }

    return rule.test(target, this.context, options);
  }
}
