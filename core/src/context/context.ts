import {Permission} from '../access-control';
import {
  GetAssociationOptions,
  SyncableObject,
  UserSyncableObject,
} from '../syncable';

export type AccessControlRuleTester = (
  target: SyncableObject,
  context: Context,
  options?: object,
) => boolean;

export abstract class Context<
  TUser extends UserSyncableObject = UserSyncableObject,
  TQuery = any
> {
  protected user!: TUser;

  protected query: TQuery | undefined;

  get permissions(): Permission[] {
    return this.user.permissions;
  }

  async updateQuery(query: TQuery): Promise<void> {
    this.query = query;
  }

  getRequisiteAssociations<T extends SyncableObject>(
    options: GetAssociationOptions<T> = {},
  ): T[] {
    return this.user.getRequisiteAssociations<T>(options);
  }
}
