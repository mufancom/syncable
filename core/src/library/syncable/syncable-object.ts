import _ from 'lodash';
import {computed} from 'mobx';

import {IContext} from '../context';

import {
  ACCESS_RIGHTS,
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

const FIELD_NAME_WHITE_LIST: (keyof ISyncable)[] = [
  '_type',
  '_id',
  '_clock',
  '_createdAt',
  '_updatedAt',
  '_acl',
];

interface AccessRightChange {
  type: 'delete' | 'add';
  accessRights: AccessRight[];
}

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

  getSanitizedFieldNames(_context: IContext): string[] {
    let fieldNameWhiteListSet = new Set([
      ...this.getSecuringFieldNames(),
      ...this.getEssentialFieldNames(),
      ...FIELD_NAME_WHITE_LIST,
    ]);

    let unreadableFieldNames = Array.from(
      this.getFieldNameToAccessRightsMap(_context).entries(),
    ).reduce<string[]>((fieldNames, [fieldName, accessRights]) => {
      if (
        !accessRights.includes('read') &&
        !fieldNameWhiteListSet.has(fieldName)
      ) {
        fieldNames.push(fieldName);
      }

      return fieldNames;
    }, []);

    return unreadableFieldNames;
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

  getFieldNameToAccessRightsMap(
    context: IContext,
    testingFieldNames = Object.keys(this.syncable),
  ): Map<string, AccessRight[]> {
    let acl = this.getACL();
    let objectAccessRightSet = new Set(this.getObjectAccessRights(context));
    let fieldsACL = acl.filter(ace => !!ace.fields);

    let fieldNameToAccessRightSetMap: Map<string, Set<AccessRight>> = new Map<
      string,
      Set<AccessRight>
    >(
      testingFieldNames.map(
        fieldName =>
          [fieldName, new Set(objectAccessRightSet)] as [
            string,
            Set<AccessRight>
          ],
      ),
    );

    for (let entry of fieldsACL) {
      let {fields: fieldNames} = entry;

      let fieldsToTest = _.intersection(testingFieldNames, fieldNames!);

      if (!fieldsToTest.length) {
        continue;
      }

      let change = this.getAccessRightsChange(entry, context);

      for (let fieldName of fieldsToTest) {
        let accessRightSet = fieldNameToAccessRightSetMap.get(fieldName)!;

        applyAccessRightChange(accessRightSet, change);
      }
    }

    return Array.from(fieldNameToAccessRightSetMap.entries()).reduce(
      (map, [fieldName, accessRightSet]) =>
        map.set(fieldName, Array.from(accessRightSet)),
      new Map<string, AccessRight[]>(),
    );
  }

  getObjectAccessRights(context: IContext): AccessRight[] {
    let acl = this.getACL();

    let objectACL = acl.filter(ace => !ace.fields);

    if (!acl.length) {
      return [...ACCESS_RIGHTS];
    }

    let objectAccessRightSet = new Set<AccessRight>();

    for (let entry of objectACL) {
      let change = this.getAccessRightsChange(
        entry,
        context,
        objectAccessRightSet,
      );

      applyAccessRightChange(objectAccessRightSet, change);
    }

    return Array.from(objectAccessRightSet);
  }

  getAccessRights(
    context: IContext,
    testingFieldNames?: string[],
  ): AccessRight[] {
    if (!testingFieldNames) {
      return this.getObjectAccessRights(context);
    }

    let fieldNameToAccessRightsMap = this.getFieldNameToAccessRightsMap(
      context,
      testingFieldNames,
    );

    return _.intersection(...Array.from(fieldNameToAccessRightsMap.values()));
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
        fieldNames ? `for field [${fieldNames.join(', ')}]` : ''
      } (${grantedRights.join(', ')}) do not match requirements (${rights.join(
        ', ',
      )})`,
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

  private getAccessRightsChange(
    entry: AccessControlEntry,
    context: IContext,
    grantedAccessRightSet?: Set<AccessRight>,
  ): AccessRightChange | undefined {
    let {type, rights} = entry;
    let grantedAccessRights =
      grantedAccessRightSet && Array.from(grantedAccessRightSet);

    rights = _.uniq(rights);

    if (
      (grantedAccessRights &&
        ((type === 'allow' &&
          !_.difference(rights, grantedAccessRights).length) ||
          (type === 'deny' &&
            !_.intersection(grantedAccessRights, rights).length))) ||
      // The test above is to avoid unnecessary `testAccessControlEntry` calls
      !this.testAccessControlEntry(entry, context)
    ) {
      return undefined;
    } else {
      return {
        type: type === 'allow' ? 'add' : 'delete',
        accessRights: rights,
      };
    }
  }
}

function applyAccessRightChange(
  accessRightSet: Set<AccessRight>,
  change: AccessRightChange | undefined,
): void {
  if (!change) {
    return;
  }

  let {accessRights, type} = change;

  for (let accessRight of accessRights) {
    type === 'delete'
      ? accessRightSet.delete(accessRight)
      : accessRightSet.add(accessRight);
  }
}

export interface ISyncableObject<T extends ISyncable = ISyncable>
  extends SyncableObject<T> {}

export const AbstractSyncableObject = SyncableObject;
