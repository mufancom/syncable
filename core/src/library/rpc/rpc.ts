import {Nominal} from 'tslang';

import {Context} from '../context';
import {SyncableProvider} from '../syncable';

export type RPCCallId = Nominal<string, 'rpc-call-id'>;

export type ExtractRPCFunctionGenericType<
  T extends RPCFunction
> = T extends RPCFunction<infer TParamType, infer TReturnType>
  ? {param: TParamType; return: TReturnType}
  : never;

export interface RPCCallData<
  TName extends keyof RPCDefinitionList = keyof RPCDefinitionList,
  TParams extends ExtractRPCFunctionGenericType<
    RPCDefinitionList[TName]
  >['param'] = ExtractRPCFunctionGenericType<RPCDefinitionList[TName]>['param']
> {
  id: RPCCallId;
  name: TName;
  params: TParams;
}

export interface RPCReturnData<TData = object> {
  id: RPCCallId;
  data: TData;
  error?: string;
}

export type RPCFunction<TParams = {}, TReturnType = any> = (
  context: Context,
  provider: SyncableProvider,
  args: TParams,
) => TReturnType;

export type RPCCall<TRpcFunction extends RPCFunction = RPCFunction> = (
  param?: ExtractRPCFunctionGenericType<TRpcFunction>['param'],
) => Promise<ExtractRPCFunctionGenericType<TRpcFunction>['return']>;

export interface RPCDefinition {
  name: string;
  call: RPCFunction;
}

export type RPCCallList<
  TRPCDefinition extends RPCDefinition = RPCDefinition
> = {[K in TRPCDefinition['name']]: RPCCall<TRPCDefinition['call']>};

export type RPCDefinitionList<
  TRPCDefinition extends RPCDefinition = RPCDefinition
> = {[K in TRPCDefinition['name']]: TRPCDefinition['call']};
