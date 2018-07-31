import {getRef} from '../@utils/syncable';
import {AccessControlEntry} from '../access-control';
import {Syncable, SyncableAssociation, SyncableRef} from '../syncable';
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
  $associate({target, source}, {requisite}) {
    let associations = target.$associations;

    if (!associations) {
      associations = target.$associations = [];
    }

    if (
      associations.find(association =>
        compareAssociationWithSyncable(association, source),
      )
    ) {
      return [];
    }

    associations.push({
      ref: getRef(source),
      requisite,
    });

    return ['associate'];
  },
  $unassociate({target, source}) {
    let associations = target.$associations;

    if (!associations) {
      return [];
    }

    let index = associations.findIndex(association =>
      compareAssociationWithSyncable(association, source),
    );

    if (index >= 0) {
      associations.splice(index, 1);
    }

    return ['associate'];
  },
  '$set-access-control-entries'({target}, {entries}) {
    let acl = target.$acl;

    if (!acl) {
      acl = target.$acl = [];
    }

    let entryMap = new Map(
      acl.map((entry): [string, AccessControlEntry] => [entry.name, entry]),
    );

    for (let entry of entries) {
      entryMap.set(entry.name, entry);
    }

    target.$acl = Array.from(entryMap.values());
  },
  '$unset-access-control-entries'({target}, {names}) {
    let acl = target.$acl;

    if (!acl) {
      return;
    }

    let nameSet = new Set(names);

    target.$acl = acl.filter(entry => !nameSet.has(entry.name));
  },
};

function compareAssociationWithSyncable(
  {ref: {type, id}}: SyncableAssociation,
  {$type, $id}: Syncable,
): boolean {
  return type === $type && id === $id;
}
