import {
  ClientRPCDefinition,
  IContext,
  RPCFunctionDict,
  RPCPeer,
  ServerConnectionRPCDefinition,
} from '@syncable/core';
import {Subscription} from 'rxjs';

import {Server, ServerGenericParams} from '../server';

import {IConnectionSource} from './connection-source';

export const connectionRPCFunctionDict: RPCFunctionDict<
  Connection<ServerGenericParams>,
  ServerConnectionRPCDefinition
> = {
  async change(packet) {
    await this.server.applyChangePacket(this.group, packet, this.context);
  },
  request() {},
  'update-view-query'() {},
};

export class Connection<
  TGenericParams extends ServerGenericParams
> extends RPCPeer<
  ServerConnectionRPCDefinition | TGenericParams['customRPCDefinition'],
  ClientRPCDefinition
> {
  private subscription = new Subscription();

  constructor(
    readonly server: Server<TGenericParams>,
    private source: IConnectionSource,
    rpcFunctionDict: RPCFunctionDict<
      Connection<TGenericParams>,
      ServerConnectionRPCDefinition | TGenericParams['customRPCDefinition']
    >,
  ) {
    super(source, rpcFunctionDict);
  }

  get group(): string {
    return this.source.group;
  }

  get context(): IContext {
    return this.source.context;
  }

  dispose(): void {
    super.dispose();

    this.subscription.unsubscribe();
  }
}
