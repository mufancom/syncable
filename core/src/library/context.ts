import {observable} from 'mobx';

import {ISyncableObject, SyncableRef} from './syncable';

/**
 * Indicates whether a context is initiated by server or user (including the
 * correspondent user context on server).
 *
 * E.g. If a client connects to a server, the server creates a context with
 * type 'user'. But for some changes initiated by server API
 * (server.update(group, change)), the context has type 'server'.
 */
export type ContextType = 'server' | 'user';

export type ContextEnvironment = 'server' | 'client';

abstract class Context<
  TSyncableObject extends ISyncableObject,
  TViewQueryMetadata extends object
> {
  @observable
  ref!: SyncableRef<TSyncableObject>;

  @observable
  object!: TSyncableObject;

  @observable
  queryMetadata: TViewQueryMetadata = {} as TViewQueryMetadata;

  constructor(
    readonly type: ContextType,
    readonly environment: ContextEnvironment,
    ref: SyncableRef<TSyncableObject> | undefined,
  ) {
    if (ref) {
      this.ref = ref;
    }
  }

  abstract get disabled(): boolean;

  setRef(ref: SyncableRef<TSyncableObject>): void {
    this.ref = ref;
  }

  setObject(object: TSyncableObject): void {
    this.ref = object.ref;
    this.object = object;
  }

  setQueryMetadata(viewQueryName: string, queryMetadata: any): void {
    this.queryMetadata[
      viewQueryName as keyof TViewQueryMetadata
    ] = queryMetadata;
  }
}

export interface IContext<
  TSyncableObject extends ISyncableObject = ISyncableObject,
  TViewQueryMetadata extends object = object
> extends Context<TSyncableObject, TViewQueryMetadata> {}

export const AbstractContext = Context;
