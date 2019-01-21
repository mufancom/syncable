import {
  ClientRPCDefinition,
  IRPCDefinition,
  RPCFunctionDict,
  RPCPeer,
  ServerConnectionRPCDefinition,
} from '@syncable/core';
import {Subscription} from 'rxjs';

import {IConnectionSource} from './connection-source';

export const connectionRPCFunctionDict: RPCFunctionDict<
  Connection<never>,
  ServerConnectionRPCDefinition
> = {
  change() {},
  request() {},
  'update-view-query'() {},
};

export class Connection<
  TCustomRPCDefinition extends IRPCDefinition
> extends RPCPeer<
  ServerConnectionRPCDefinition | TCustomRPCDefinition,
  ClientRPCDefinition
> {
  readonly group: string;

  private subscription = new Subscription();

  constructor(
    source: IConnectionSource,
    rpcFunctionDict: RPCFunctionDict<
      Connection<TCustomRPCDefinition>,
      ServerConnectionRPCDefinition | TCustomRPCDefinition
    >,
  ) {
    super(source, rpcFunctionDict);

    this.group = source.group;
  }

  dispose(): void {
    super.dispose();

    this.subscription.unsubscribe();
  }
}
