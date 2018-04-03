import {ObservableMap, observable} from 'mobx';

import {Dict} from './lang';
import {
  AccessControlEntry,
  Permission,
  Resource,
  ResourceId,
  ResourceRef,
  Syncable,
  ResourceConstructor,
} from './resource';
import {convertDictToMap} from './util/object';

export abstract class Context<User extends Resource = Resource> {
  /**
   * User associated with current context.
   */
  protected abstract user: User | undefined;
  /**
   * Context permissions, e.g.: SMS, email verified for specific purpose.
   */
  protected abstract permissions: Permission[] | undefined;

  private registeredResourceMap = new Map<string, ResourceConstructor>();

  private syncableMapMap = observable.map<
    string,
    ObservableMap<ResourceId, Syncable>
  >();

  private resourceMapMap = observable.map<
    string,
    ObservableMap<ResourceId, Resource>
  >();

  constructor(private accessControlRuleSet: AccessControlRuleSet) {}

  get grantedPermissions(): Permission[] {
    let user = this.user;
    let userPermissions = user ? user.grantedPermissions : [];
    let permissions = this.permissions || [];

    return [...permissions, ...userPermissions];
  }

  registerResourceType<T extends Resource>(
    type: T['type'],
    ResourceClass: ResourceConstructor<T>,
  ): void {
    let map = this.registeredResourceMap;

    if (map.has(type)) {
      throw new Error(
        `Resource with type "${type}" has already been registered`,
      );
    }

    map.set(type, ResourceClass);
  }

  get<T extends Resource>(ref: ResourceRef<T>): T | undefined {
    let {type, id} = ref;

    let resourceMapMap = this.resourceMapMap;
    let resourceMap = resourceMapMap.get(type);

    let resource = resourceMap && resourceMap.get(id);

    if (!resource) {
      let syncableMap = this.syncableMapMap.get(type);
      let syncable = syncableMap && syncableMap.get(id);

      if (!syncable) {
        return undefined;
      }

      resource = this.createResource(type, syncable, this);

      if (!resourceMap) {
        resourceMap = observable.map<ResourceId, Resource>();
        resourceMapMap.set(type, resourceMap);
      }

      resourceMap.set(id, resource);
    }

    return resource as T;
  }

  update<T extends Resource>(resource: T): void {}

  testAccessControlEntry(
    entry: AccessControlEntry,
    resource: Resource,
  ): boolean {
    return this.accessControlRuleSet.test(entry, resource, this);
  }

  addSyncableToCache<T extends Resource>(syncable: T['syncable']): void {
    let {type, id} = syncable;

    let mapMap = this.syncableMapMap;
    let map = mapMap.get(type);

    if (!map) {
      map = observable.map<ResourceId>();
      mapMap.set(type, map);
    }

    map.set(id, syncable);
  }

  private createResource<T extends Resource>(
    type: T['type'],
    syncable: Syncable,
    context: Context,
  ): T {
    let ResourceClass = this.registeredResourceMap.get(type) as
      | ResourceConstructor<T>
      | undefined;

    if (!ResourceClass) {
      throw new Error(`Unknown resource type "${type}"`);
    }

    return new ResourceClass(syncable, context);
  }
}

export type AccessControlRule = (
  resource: Resource,
  context: Context,
  options: object | undefined,
) => boolean;

export class AccessControlRuleSet {
  private map: Map<string, AccessControlRule>;

  constructor(rules: Dict<AccessControlRule>) {
    this.map = new Map(convertDictToMap(rules));
  }

  test(
    {name, options}: AccessControlEntry,
    resource: Resource,
    context: Context,
  ): boolean {
    let rule = this.map.get(name);

    if (!rule) {
      throw new TypeError(`Unknown access control rule "${name}"`);
    }

    return rule(resource, context, options);
  }
}
