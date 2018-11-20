import {Dict, Nominal} from 'tslang';

import {ISyncableObject, SyncableRef} from '../syncable';

export type ChangePacketId = Nominal<string, 'change-id'>;

export interface SyncableCreationRef<
  T extends ISyncableObject = ISyncableObject
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
  id: ChangePacketId;
  createdAt: number;
}
