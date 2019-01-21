import {RPCPeer} from './rpc-peer';

export interface IRPCDefinition {
  name: string;
  args: unknown[];
  return: unknown;
}

export type RPCPeerLocalDefinition<TPeer> = TPeer extends RPCPeer<infer T>
  ? T
  : never;

export type RPCPeerRemoteDefinition<TPeer> = TPeer extends RPCPeer<
  IRPCDefinition,
  infer T
>
  ? T
  : never;

export type RPCFunction<TPeer, TDefinition extends IRPCDefinition> = (
  this: TPeer,
  ...args: TDefinition['args']
) => TDefinition['return'];

export type RPCFunctionDict<TPeer, TDefinition extends IRPCDefinition> = {
  [TName in TDefinition['name']]: RPCFunction<
    TPeer,
    Extract<TDefinition, {name: TName}>
  >
};
