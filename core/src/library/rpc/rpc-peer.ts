import {Observable, Subscription} from 'rxjs';
import {Dict} from 'tslang';

import {hasOwnProperty} from '../@utils';
import {generateUniqueId} from '../utils';

import {
  RPCCallId,
  RPCData,
  RPCRequest,
  RPCResponse,
  RPCResponseError,
} from './rpc-call';
import {IRPCDefinition, RPCFunctionDict} from './rpc-definition';
import {RPCError} from './rpc-error';

export interface IRPCAdapter {
  incoming$: Observable<RPCData>;
  send(outgoing: RPCData): Promise<void>;
}

interface RequestHandlers {
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

export class RPCPeer<
  TLocalDefinition extends IRPCDefinition = IRPCDefinition,
  TRemoteDefinition extends IRPCDefinition = IRPCDefinition
> {
  private requestHandlersMap = new Map<RPCCallId, RequestHandlers>();

  private incomingSubscription = new Subscription();

  constructor(
    private adapter: IRPCAdapter,
    private functionDict: RPCFunctionDict<RPCPeer, TLocalDefinition>,
  ) {
    this.incomingSubscription.add(adapter.incoming$.subscribe(this.onIncoming));
  }

  async call<TName extends TRemoteDefinition['name']>(
    name: TName,
    ...args: Extract<TRemoteDefinition, {name: TName}>['args']
  ): Promise<Extract<TRemoteDefinition, {name: TName}>['return']> {
    let id = generateUniqueId<RPCCallId>();

    let handlersMap = this.requestHandlersMap;
    let handlers: RequestHandlers;

    let request: RPCRequest = {
      type: 'request',
      id,
      name,
      args,
    };

    let responsePromise = new Promise<unknown>((resolve, reject) => {
      handlers = {resolve, reject};
      handlersMap.set(id, handlers);
    });

    this.adapter.send(request).catch(error => {
      if (handlersMap.has(id)) {
        handlersMap.delete(id);
        handlers.reject(error);
      }
    });

    return responsePromise;
  }

  dispose(): void {
    this.incomingSubscription.unsubscribe();
  }

  private onIncoming = (data: RPCData): void => {
    switch (data.type) {
      case 'request':
        this.handleRequest(data);
        break;
      case 'response':
        this.handleResponse(data);
        break;
    }
  };

  private handleRequest(request: RPCRequest): void {
    this._handleRequest(request).catch(console.error);
  }

  private async _handleRequest({id, name, args}: RPCRequest): Promise<void> {
    let value: unknown;
    let responseError: RPCResponseError | undefined;

    try {
      value = await this.callFunction(name, args);
    } catch (error) {
      if (error instanceof RPCError) {
        responseError = {
          code: error.code,
          message: error.message,
        };

        console.error(error.message);
      } else {
        responseError = {
          code: 'UNKNOWN',
          message: 'Unknown syncable PRC error',
        };

        console.error(error instanceof Error ? error.stack : error);
      }
    }

    await this.adapter.send({
      type: 'response',
      id,
      return: value,
      throw: responseError,
    });
  }

  private handleResponse({
    id,
    return: value,
    throw: responseError,
  }: RPCResponse): void {
    let handlersMap = this.requestHandlersMap;

    let handlers = handlersMap.get(id);

    if (!handlers) {
      console.error(`Cannot find RPC request handlers with ID "${id}"`);
      return;
    }

    handlersMap.delete(id);

    if (responseError) {
      let error = new RPCError(responseError.code, responseError.message);
      handlers.reject(error);
    } else {
      handlers.resolve(value);
    }
  }

  private async callFunction(name: string, args: unknown[]): Promise<unknown> {
    let functionDict = this.functionDict;

    if (!hasOwnProperty(functionDict, name)) {
      throw new Error();
    }

    let fn = (functionDict as Dict<Function>)[name];

    return fn.apply(this, args);
  }
}
