import {AccessControlEntry} from '../access-control';
import {SyncableRef} from '../syncable';
import {Change} from './change';

export type AccessControlChange =
  | AssociateChange
  | UnassociateChange
  | AddAccessControlEntriesChange;

////////////////
// $associate //
////////////////

export interface AssociateChangeRefDict {
  target: SyncableRef;
  source: SyncableRef;
}

export type AssociateChange = Change<'$associate', AssociateChangeRefDict>;

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
// $add-access-control-entries //
/////////////////////////////////

export interface AddAccessControlEntriesChangeRefDict {
  target: SyncableRef;
}

export interface AddAccessControlEntriesChangeOptions {
  entries: AccessControlEntry[];
}

export type AddAccessControlEntriesChange = Change<
  '$add-access-control-entries',
  AddAccessControlEntriesChangeRefDict,
  AddAccessControlEntriesChangeOptions
>;

////////////////////////////////////
// $remove-access-control-entries //
////////////////////////////////////

export interface RemoveAccessControlEntriesChangeRefDict {
  target: SyncableRef;
}

export interface RemoveAccessControlEntriesChangeOptions {
  entries: AccessControlEntry[];
}

export type RemoveAccessControlEntriesChange = Change<
  '$remove-access-control-entries',
  RemoveAccessControlEntriesChangeRefDict,
  RemoveAccessControlEntriesChangeOptions
>;
