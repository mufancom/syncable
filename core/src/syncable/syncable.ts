import {StringType} from '../lang';

export type SyncableId<Type extends string> = StringType<Type, 'id'>;

export interface SyncableRef<T extends Syncable> {
  id: T['id'];
  type: T['type'];
}

export interface Syncable<Type extends string = string> {
  id: SyncableId<Type>;
  type: Type;
}
