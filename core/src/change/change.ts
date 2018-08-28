import {Dict, Nominal} from 'tslang';

import {AbstractSyncableObject, SyncableRef} from '../syncable';

export type ChangePacketUID = Nominal<string, 'change-uid'>;

export interface SyncableCreationRef<
  T extends AbstractSyncableObject = AbstractSyncableObject
> extends SyncableRef<T> {
  creation: true;
}

export type GeneralSyncableRef = SyncableRef | SyncableCreationRef;

export interface IChange<
  TType extends string = string,
  TRefDict extends object = object,
  TOptions extends object = object
> {
  type: TType;
  refs: TRefDict;
  options: TOptions;
}

export type GeneralChange = IChange<
  string,
  Dict<SyncableRef | SyncableCreationRef>,
  Dict<any>
>;

export interface ChangePacket extends GeneralChange {
  uid: ChangePacketUID;
}
