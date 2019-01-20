import {Nominal} from 'tslang';

export type RPCCallId = Nominal<string, 'rpc-call-id'>;

export type RPCData = RPCRequest | RPCResponse;

export interface RPCRequest {
  type: 'request';
  id: RPCCallId;
  name: string;
  args: unknown[];
}

export interface RPCResponseError {
  code: string;
  message: string;
}

export interface RPCResponse {
  type: 'response';
  id: RPCCallId;
  return?: unknown;
  throw?: RPCResponseError;
}
