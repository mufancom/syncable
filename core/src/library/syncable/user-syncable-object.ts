import {ISyncable} from './syncable';
import {AbstractSyncableObject} from './syncable-object';

abstract class UserSyncableObject<
  T extends ISyncable = ISyncable
> extends AbstractSyncableObject<T> {}

export interface IUserSyncableObject<T extends ISyncable = ISyncable>
  extends UserSyncableObject<T> {}

export const AbstractUserSyncableObject = UserSyncableObject;
