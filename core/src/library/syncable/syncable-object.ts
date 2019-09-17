import _ from 'lodash';
import {computed} from 'mobx';

import {IContext} from '../context';

import {
  ACCESS_RIGHTS,
  AccessControlEntry,
  AccessControlEntryRuleName,
  AccessRight,
  FieldAccessControlEntry,
  ObjectAccessControlEntry,
  SYNCABLE_FIELD_WHITE_LIST,
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

  getSanitizedFieldNames(context: IContext): string[] {
    let fieldNameWhiteListSet = new Set([
      ...this.getSecuringFieldNames(),
      ...this.getEssentialFieldNames(),
      ...SYNCABLE_FIELD_WHITE_LIST,
    ]);

    return Array.from(this.getFieldNameToAccessRightsMap(context))
      .filter(
        ([fieldName, accessRights]) =>
          !accessRights.includes('read') &&
          !fieldNameWhiteListSet.has(fieldName),
      )
      .map(([fieldName]) => fieldName);
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
  getEssentialFieldNames(): string[] {
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

  getAccessRights(context: IContext, fieldNames?: string[]): AccessRight[] {
    if (!fieldNames) {
      return this.getObjectAccessRights(context);
    }

    let fieldNameToAccessRightsMap = this.getFieldNameToAccessRightsMap(
      context,
      fieldNames,
    );

    return _.intersection(...fieldNameToAccessRightsMap.values());
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
        fieldNames ? `for fields [${fieldNames.join(', ')}]` : ''
      } (${grantedRights.join(', ')}) do not match requirements (${rights.join(
        ', ',
      )})`,
    );
  }

  @AccessControlRule('basic')
  protected testBasic(): boolean {
    return true;
  }

  private getObjectAccessRights(context: IContext): AccessRight[] {
    let objectACL = this.getObjectACL();

    if (!objectACL.length) {
      return [...ACCESS_RIGHTS];
    }

    let grantedAccessRights: AccessRight[] = [];

    for (let entry of objectACL) {
      let {type, rights} = entry;

      if (
        (type === 'allow' &&
          !_.difference(rights, grantedAccessRights).length) ||
        (type === 'deny' &&
          !_.intersection(grantedAccessRights, rights).length) ||
        // The test above is to avoid unnecessary `testAccessControlEntry` calls
        !this.testAccessControlEntry(entry, context)
      ) {
        continue;
      }

      grantedAccessRights = overrideAccessRights(grantedAccessRights, entry);
    }

    return grantedAccessRights;
  }

  private getFieldNameToAccessRightsMap(
    context: IContext,
    fieldNames?: string[],
  ): Map<string, AccessRight[]> {
    let objectAccessRights = this.getObjectAccessRights(context);

    let fieldNameToAccessRightsMap = new Map(
      fieldNames &&
        fieldNames.map((fieldName): [string, AccessRight[]] => [
          fieldName,
          objectAccessRights,
        ]),
    );

    let fieldsACL = this.getFieldsACL();

    for (let entry of fieldsACL) {
      let {fields: aceFieldNames} = entry;

      if (aceFieldNames === '*') {
        aceFieldNames = Object.keys(this.syncable);
      }

      let testingFieldNames = fieldNames
        ? _.intersection(fieldNames, aceFieldNames)
        : aceFieldNames;

      if (!testingFieldNames.length) {
        continue;
      }

      if (!this.testAccessControlEntry(entry, context)) {
        continue;
      }

      for (let fieldName of testingFieldNames) {
        let grantedAccessRights = fieldNameToAccessRightsMap.get(fieldName);

        grantedAccessRights = overrideAccessRights(
          grantedAccessRights || objectAccessRights,
          entry,
        );

        fieldNameToAccessRightsMap.set(fieldName, grantedAccessRights);
      }
    }

    return fieldNameToAccessRightsMap;
  }

  private getObjectACL(): ObjectAccessControlEntry[] {
    return this.getACL().filter(ace => !('fields' in ace));
  }

  private getFieldsACL(): FieldAccessControlEntry[] {
    return this.getACL().filter(
      (ace): ace is FieldAccessControlEntry => 'fields' in ace,
    );
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

interface AccessRightOverride {
  type: 'deny' | 'allow';
  rights: AccessRight[];
}

function overrideAccessRights(
  grantedAccessRights: AccessRight[],
  {rights, type}: AccessRightOverride,
): AccessRight[] {
  if (type === 'allow') {
    return _.union(grantedAccessRights, rights);
  } else {
    return _.difference(grantedAccessRights, rights);
  }
}

export interface ISyncableObject<T extends ISyncable = ISyncable>
  extends SyncableObject<T> {}

export const AbstractSyncableObject = SyncableObject;
