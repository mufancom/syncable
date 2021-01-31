import {observable} from 'mobx';
import {Dict} from 'tslang';

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
  TViewQueryMetadataDict extends object
> {
  @observable
  ref!: SyncableRef<TSyncableObject>;

  @observable
  object!: TSyncableObject;

  @observable
  queryMetadataDict: Partial<TViewQueryMetadataDict> = {};

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

  setQueryMetadata(name: string, metadata: unknown): void {
    (this.queryMetadataDict as Dict<unknown>)[name] = metadata;
  }
}

export interface IContext<
  TSyncableObject extends ISyncableObject = ISyncableObject,
  TViewQueryMetadataDict extends object = Dict<unknown>
> extends Context<TSyncableObject, TViewQueryMetadataDict> {}

export const AbstractContext = Context;
