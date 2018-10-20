import {ISyncable, IUserSyncableObject} from '../syncable';

export type Permission = unknown;

export type PermissionType<
  TUser extends IUserSyncableObject
> = TUser extends IUserSyncableObject<ISyncable, infer TPermission>
  ? TPermission
  : never;
