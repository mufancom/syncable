import {AbstractUserSyncableObject, ISyncable} from '../syncable';

export type Permission = unknown;

export type PermissionType<
  TUser extends AbstractUserSyncableObject
> = TUser extends AbstractUserSyncableObject<ISyncable, infer TPermission>
  ? TPermission
  : never;
