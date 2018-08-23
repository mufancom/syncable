import {Syncable, UserSyncableObject} from '../syncable';

export type Permission = unknown;

export type PermissionType<
  TUser extends UserSyncableObject
> = TUser extends UserSyncableObject<Syncable, infer TPermission>
  ? TPermission
  : never;
