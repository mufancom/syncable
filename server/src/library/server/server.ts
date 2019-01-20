import {IRPCDefinition, RPCFunctionDict} from '@syncable/core';

import {Connection, IConnectionSource} from '../connection';

import {IServerAdapter} from './server-adapter';

export class Server<TRPCDefinition extends IRPCDefinition> {
  constructor(
    private serverAdapter: IServerAdapter,
    private rpcFunctionDict: RPCFunctionDict<TRPCDefinition>,
  ) {
    serverAdapter.connectionSource$.subscribe(this.onConnectionSource);
  }

  private onConnectionSource = (source: IConnectionSource): void => {
    let connection = new Connection(source, this.rpcFunctionDict);
  };
}
