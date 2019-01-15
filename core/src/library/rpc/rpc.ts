import {Nominal} from 'tslang';

export type RPCCallId = Nominal<string, 'rpc-call-id'>;

export interface RPCCallData {
  id: RPCCallId;
  name: string;
  params: object;
}

export interface RPCCallError {
  code: string;
  message?: string;
}

export interface RPCCallResult {
  id: RPCCallId;
  data?: unknown;
  error?: RPCCallError;
}

export interface IRPCDefinition<
  TName extends string = string,
  TParams extends object = object,
  TReturn = unknown
> {
  name: TName;
  params: TParams;
  return: TReturn;
}
