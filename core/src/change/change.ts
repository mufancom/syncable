import {Dict, Nominal} from 'tslang';

import {SyncableObject, SyncableRef} from '../syncable';

export type ChangePacketUID = Nominal<string, 'change-uid'>;

export interface SyncableCreationRef<T extends SyncableObject = SyncableObject>
  extends SyncableRef<T> {
  creation: true;
}

export type GeneralSyncableRef = SyncableRef | SyncableCreationRef;

export interface Change<
  Type extends string = string,
  RefDict extends object = object,
  Options extends object = object
> {
  type: Type;
  refs: RefDict;
  options: Options;
}

export type GeneralChange = Change<
  string,
  Dict<SyncableRef | SyncableCreationRef>,
  Dict<any>
>;

export interface ChangePacket extends GeneralChange {
  uid: ChangePacketUID;
}
