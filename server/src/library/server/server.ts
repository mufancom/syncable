import {
  IRPCDefinition,
  RPCFunctionDict,
  ServerConnectionRPCDefinition,
} from '@syncable/core';

import {
  Connection,
  IConnectionSource,
  connectionRPCFunctionDict,
} from '../connection';

import {IServerAdapter} from './server-adapter';

export class Server<TCustomRPCDefinition extends IRPCDefinition> {
  private connectionSet = new Set<Connection<TCustomRPCDefinition>>();

  private extendedConnectionRPCFunctionDict: RPCFunctionDict<
    Connection<TCustomRPCDefinition>,
    ServerConnectionRPCDefinition | TCustomRPCDefinition
  >;

  constructor(
    serverAdapter: IServerAdapter,
    customRPCFunctionDict: RPCFunctionDict<
      Connection<TCustomRPCDefinition>,
      TCustomRPCDefinition
    >,
  ) {
    serverAdapter.connectionSource$.subscribe(this.onConnectionSource);

    this.extendedConnectionRPCFunctionDict = {
      ...connectionRPCFunctionDict,
      ...customRPCFunctionDict,
    };
  }

  private onConnectionSource = (source: IConnectionSource): void => {
    let connection = new Connection(
      source,
      this.extendedConnectionRPCFunctionDict,
    );

    this.connectionSet.add(connection);
  };
}
