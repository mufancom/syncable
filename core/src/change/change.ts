import {Dict, StringType} from '../lang';
import {SyncableRef} from '../syncable';

export type ChangePacketUID = StringType<'change-uid'>;

export interface Change<
  Type extends string = string,
  RefDict extends object = object,
  Options extends object = object
> {
  type: Type;
  refs: RefDict;
  options: Options;
}

export type GeneralChange = Change<string, Dict<SyncableRef>, Dict<any>>;

export interface ChangePacket extends GeneralChange {
  uid: ChangePacketUID;
}
