import {computed} from 'mobx';

import {Context} from './context';
import {Dict, ExcludeProperty, StringType} from './lang';

export type AccessType = 'read' | 'write' | 'associate';

export const ACCESS_TYPES: AccessType[] = ['read', 'write', 'associate'];

export interface AccessControlEntry<Options extends object = object> {
  name: string;
  types: AccessType[];
  options?: Options;
}

export type ResourceId<T extends Syncable = Syncable> = StringType<T, 'id'>;

export interface ResourceRef<T extends Resource = Resource> {
  id: ResourceId<T>;
  type: T['type'];
}

export type ResourceSyncableAssociation<T extends Resource = Resource> =
  | ResourceSyncableRequisiteAssociation<T>
  | ResourceSyncableNonRequisiteAssociation<T>;

export interface ResourceSyncableRequisiteAssociation<
  T extends Resource = Resource
> {
  ref: ResourceRef<T>;
  name?: string;
  requisite: true;
  // grants?: boolean;
  // secures?: boolean;
}

export interface ResourceSyncableNonRequisiteAssociation<
  T extends Resource = Resource
> {
  ref: ResourceRef<T>;
  name?: string;
  requisite: false;
}

export type AssociateOptions = ExcludeProperty<
  ResourceSyncableAssociation,
  'ref'
>;

export interface Permission {
  name: string;
}

export interface Syncable<TypeString extends string = string> {
  id: ResourceId<this>;
  type: TypeString;
  /**
   * Resource associations of this resource.
   */
  $associations?: ResourceSyncableAssociation[];
  /**
   * Specific access control list of this resource.
   */
  $acl?: AccessControlEntry[];
  /**
   * Permissions of this resource, only applied if this resource is a user that
   * will be attached to a context.
   */
  $permissions?: Permission[];
  /**
   * Permissions that this resource can grants a user.
   */
  $grants?: Permission[];
  /**
   * A dictionary of extra access control list to be attached by associating
   * this resource with the target resource.
   */
  $secures?: Dict<AccessControlEntry[] | false | undefined>;
}

export type ResourceConstructor<T extends Resource = Resource> = new (
  syncable: T['syncable'],
  context: Context,
) => T;

export abstract class Resource<T extends Syncable = Syncable> {
  constructor(readonly syncable: T, readonly context: Context) {}

  get id(): ResourceId<T> {
    return this.syncable.id;
  }

  get type(): T['type'] {
    return this.syncable.type;
  }

  @computed
  get requisiteAssociatedResources(): Resource[] {
    let context = this.context;
    let associations = this.syncable.$associations || [];

    return associations
      .filter(
        (association): association is ResourceSyncableRequisiteAssociation =>
          association.requisite,
      )
      .map(association => context.get(association.ref)!);
  }

  @computed
  get accessControlList(): AccessControlEntry[] {
    let acl = this.syncable.$acl || [];
    let type = this.type;

    return this.requisiteAssociatedResources
      .map(resource => resource.getSecuringACL(type))
      .reduce((flatten, securingACL) => [...flatten, ...securingACL], acl);
  }

  @computed
  get grantedPermissions(): Permission[] {
    let permissions = this.syncable.$permissions || [];

    return this.requisiteAssociatedResources
      .map(resource => resource.getGrantingPermissions())
      .reduce(
        (flatten, grantingPermissions) => [...flatten, ...grantingPermissions],
        permissions,
      );
  }

  @computed
  get permittedAccessTypeSet(): Set<AccessType> {
    let acl = this.accessControlList;

    if (!acl.length) {
      return new Set(ACCESS_TYPES);
    }

    let context = this.context;
    let set = new Set<AccessType>();

    for (let entry of acl) {
      if (context.testAccessControlEntry(entry, this)) {
        for (let type of entry.types) {
          set.add(type);
        }
      }
    }

    return set;
  }

  validateAccess(...types: AccessType[]): void {
    if (!this.testAccess(...types)) {
      // TODO: dedicated error type
      throw new Error('Permission denied');
    }
  }

  testAccess(...types: AccessType[]): boolean {
    let permittedTypes = this.permittedAccessTypeSet;
    return types.every(type => permittedTypes.has(type));
  }

  associate(resource: Resource, options: AssociateOptions): void {
    if (options.requisite) {
    }

    resource.validateAccess('associate');

    this.context.update(resource);
  }

  unassociate(resource: Resource): void {
    resource.validateAccess('associate');

    this.context.update(resource);
  }

  getAssociatedResources<T extends Resource>(
    type: T['type'],
    name: string,
  ): (T | undefined)[] {
    let context = this.context;
    let associations = this.syncable.$associations || [];

    return associations
      .filter(
        (association): association is ResourceSyncableAssociation<T> =>
          association.ref.type === type && association.name === name,
      )
      .map(association => context.get(association.ref));
  }

  getRequisiteAssociatedResources<T extends Resource>(
    type: T['type'],
    name?: string,
  ): T[] {
    let context = this.context;
    let associations = this.syncable.$associations || [];

    return associations
      .filter(
        (association): association is ResourceSyncableRequisiteAssociation<T> =>
          association.ref.type === type &&
          association.name === name &&
          association.requisite,
      )
      .map(association => context.get(association.ref)!);
  }

  private getSecuringACL(type: string): AccessControlEntry[] {
    let secures = this.syncable.$secures || {};
    let acl = secures[type];

    if (acl) {
      return acl;
    }

    if (acl === false) {
      return [];
    }

    throw new TypeError(
      `Type "${type}" is missing in the secures dictionary of ${this.type}`,
    );
  }

  private getGrantingPermissions(): Permission[] {
    return this.syncable.$grants || [];
  }
}
