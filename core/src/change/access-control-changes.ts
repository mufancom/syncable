import _ from 'lodash';

import {AccessControlEntry} from '../access-control';
import {Syncable, SyncableAssociation, SyncableRef} from '../syncable';
import {getSyncableRef} from '../utils';

import {Change} from './change';
import {ChangePlantBlueprint} from './change-plant';

export type AccessControlChange =
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
  requisite: boolean;
  secures: boolean;
}

export type AssociateChange = Change<
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

export type UnassociateChange = Change<
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
  entries: AccessControlEntry[];
}

export type SetAccessControlEntriesChange = Change<
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
  names: string[];
}

export type UnsetAccessControlEntriesChange = Change<
  '$unset-access-control-entries',
  UnsetAccessControlEntriesChangeRefDict,
  UnsetAccessControlEntriesChangeOptions
>;

export const accessControlChangePlantBlueprint: ChangePlantBlueprint<
  AccessControlChange
> = {
  $associate(
    {target, source},
    {requisite, secures, objects: {target: targetObject}, context},
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
      ...(requisite ? {requisite: true} : undefined),
      ...(secures ? {secures: true} : undefined),
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
  $unassociate({target, source}, {objects: {target: targetObject}, context}) {
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
    {objects: {target: targetObject}, context, entries},
  ) {
    targetObject.validateAccessRights(['full'], context);

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
  },
  '$unset-access-control-entries'(
    {target},
    {objects: {target: targetObject}, context, names},
  ) {
    targetObject.validateAccessRights(['full'], context);

    let acl = target._acl;

    if (!acl) {
      return;
    }

    let nameSet = new Set(names);

    target._acl = acl.filter(entry => !nameSet.has(entry.name));
  },
};

function compareAssociationWithSyncable(
  {ref: {type, id}}: SyncableAssociation,
  {_type, _id}: Syncable,
): boolean {
  return type === _type && id === _id;
}
