import _ = require('lodash');

import {AccessRight} from '../access-control';
import {AccessControlRule, Context} from '../context';
import {StringType} from '../lang';
import {Syncable} from './syncable';

export type AccessControlRuleName = StringType<'access-control', 'rule-name'>;

export type AccessControlRuleValidator<
  T extends SyncableObject,
  Options extends object
> = (target: T, context: Context, options?: Options) => void;

export interface AccessControlRuleEntry<
  T extends SyncableObject,
  Options extends object
> {
  validator: AccessControlRuleValidator<T, Options>;
}

export interface GetAssociationOptions<T extends SyncableObject> {
  name?: string;
  type?: T['type'];
}

export abstract class SyncableObject<T extends Syncable = Syncable> {
  /** @internal */
  // tslint:disable-next-line:variable-name
  __accessControlRuleMap = new Map<
    AccessControlRuleName,
    AccessControlRuleEntry<SyncableObject, object>
  >();

  constructor(protected syncable: T, protected context: Context) {}

  get id(): T['id'] {
    return this.syncable.id;
  }

  get type(): T['type'] {
    return this.syncable.type;
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

  getAccessRights(): AccessRight[] {}

  getGrantableAccessRights(): AccessRight[] {}

  validateAccessRights(rights: AccessRight[]): void {
    let grantedRights = this.getAccessRights();

    if (_.difference(rights, grantedRights).length === 0) {
      return;
    }

    throw new Error();
  }
}
