import _ from 'lodash';

import {
  AccessControlEntry,
  SecuringAccessControlEntry,
} from '../access-control';
import {
  AbstractUserSyncableObject,
  ISyncable,
  SyncableAssociation,
  SyncableRef,
} from '../syncable';
import {getSyncableRef} from '../utils';

import {IChange} from './change';
import {ChangePlantBlueprint} from './change-plant';

export type BuiltInChange =
  | AssociateChange
  | UnassociateChange
  | SetAccessControlEntriesChange
  | UnsetAccessControlEntriesChange;

////////////////
// $associate //
////////////////

export interface AssociateChangeRefDict {
  target: SyncableRef;
  source: SyncableRef;
}

export interface AssociateChangeOptions {
  name?: string;
  requisite: boolean;
  secures: boolean;
}

export type AssociateChange = IChange<
  '$associate',
  AssociateChangeRefDict,
  AssociateChangeOptions
>;

//////////////////
// $unassociate //
//////////////////

export interface UnassociateChangeRefDict {
  target: SyncableRef;
  source: SyncableRef;
}

export type UnassociateChange = IChange<
  '$unassociate',
  UnassociateChangeRefDict
>;

/////////////////////////////////
// $set-access-control-entries //
/////////////////////////////////

export interface SetAccessControlEntriesChangeRefDict {
  target: SyncableRef;
}

export interface SetAccessControlEntriesChangeOptions {
  entries?: AccessControlEntry[];
  securingEntries?: SecuringAccessControlEntry[];
}

export type SetAccessControlEntriesChange = IChange<
  '$set-access-control-entries',
  SetAccessControlEntriesChangeRefDict,
  SetAccessControlEntriesChangeOptions
>;

////////////////////////////////////
// $unset-access-control-entries //
////////////////////////////////////

export interface UnsetAccessControlEntriesChangeRefDict {
  target: SyncableRef;
}

export interface UnsetAccessControlEntriesChangeOptions {
  names?: string[];
  securingNames?: string[];
}

export type UnsetAccessControlEntriesChange = IChange<
  '$unset-access-control-entries',
  UnsetAccessControlEntriesChangeRefDict,
  UnsetAccessControlEntriesChangeOptions
>;

export const builtInChangePlantBlueprint: ChangePlantBlueprint<
  AbstractUserSyncableObject,
  BuiltInChange
> = {
  $associate(
    {target, source},
    {target: targetObject},
    {context, options: {name, requisite, secures}},
  ) {
    let associations = target._associations;

    if (!associations) {
      associations = target._associations = [];
    }

    let matchedIndex = associations.findIndex(association =>
      compareAssociationWithSyncable(association, source),
    );

    let matchedAssociation =
      matchedIndex >= 0 ? associations[matchedIndex] : undefined;

    let updatedAssociation: SyncableAssociation = {
      ref: getSyncableRef(source),
      name,
      requisite: requisite || undefined,
      secures: secures || undefined,
    };

    let securesRelated: boolean;

    if (matchedAssociation) {
      if (_.isEqual(updatedAssociation, matchedAssociation)) {
        return;
      }

      securesRelated = secures || !!matchedAssociation.secures;
    } else {
      securesRelated = secures;
    }

    targetObject.validateAccessRights(
      [securesRelated ? 'full' : 'write'],
      context,
    );

    if (matchedAssociation) {
      associations[matchedIndex] = updatedAssociation;
    } else {
      associations.push(updatedAssociation);
    }
  },
  $unassociate({target, source}, {target: targetObject}, {context}) {
    let associations = target._associations;

    if (!associations) {
      return;
    }

    let index = associations.findIndex(association =>
      compareAssociationWithSyncable(association, source),
    );

    if (index >= 0) {
      let {secures} = associations[index];

      targetObject.validateAccessRights([secures ? 'full' : 'write'], context);

      associations.splice(index, 1);
    }
  },
  '$set-access-control-entries'(
    {target},
    {target: targetObject},
    {context, options: {entries, securingEntries}},
  ) {
    targetObject.validateAccessRights(['full'], context);

    if (entries) {
      let acl = target._acl;

      if (!acl) {
        acl = target._acl = [];
      }

      let entryMap = new Map(
        acl.map((entry): [string, AccessControlEntry] => [entry.name, entry]),
      );

      for (let entry of entries) {
        entryMap.set(entry.name, entry);
      }

      target._acl = Array.from(entryMap.values());
    }

    if (securingEntries) {
      let secures = target._secures;

      if (!secures) {
        secures = target._secures = [];
      }

      let securingEntryMap = new Map(
        secures.map((entry): [string, SecuringAccessControlEntry] => [
          entry.name,
          entry,
        ]),
      );

      for (let entry of securingEntries) {
        securingEntryMap.set(entry.name, entry);
      }

      target._secures = Array.from(securingEntryMap.values());
    }
  },
  '$unset-access-control-entries'(
    {target},
    {target: targetObject},
    {context, options: {names, securingNames}},
  ) {
    targetObject.validateAccessRights(['full'], context);

    let acl = target._acl;
    let secures = target._secures;
    let nameSet = new Set(names);
    let securingNameSet = new Set(securingNames);

    if (acl) {
      target._acl = acl.filter(entry => !nameSet.has(entry.name));
    }

    if (secures) {
      target._secures = secures.filter(
        entry => !securingNameSet.has(entry.name),
      );
    }
  },
};

function compareAssociationWithSyncable(
  {ref: {type, id}}: SyncableAssociation,
  {_type, _id}: ISyncable,
): boolean {
  return type === _type && id === _id;
}
