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

abstract class Context<TSyncableObject extends ISyncableObject> {
  @observable
  ref!: SyncableRef<TSyncableObject>;

  @observable
  object!: TSyncableObject;

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
}

export interface IContext<
  TSyncableObject extends ISyncableObject = ISyncableObject
> extends Context<TSyncableObject> {}

export const AbstractContext = Context;
