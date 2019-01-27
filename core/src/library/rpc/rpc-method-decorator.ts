import {hasOwnProperty} from '../@utils';

import {IRPCDefinition} from './rpc-definition';
import {RPCPeer} from './rpc-peer';

export type RPCMethod<TDefinition extends IRPCDefinition> = (
  ...args: TDefinition['args']
) => Promise<TDefinition['return']> | TDefinition['return'];

export type RPCMethodDecorator = (
  target: RPCPeer,
  name: string,
  descriptor: TypedPropertyDescriptor<Function>,
) => void;

export function RPCMethod(): RPCMethodDecorator {
  return (target, name, descriptor) => {
    let method = descriptor.value!;

    if (hasOwnProperty(target, '__methodMap')) {
      target.__methodMap.set(name, method);
    } else {
      let methodEntries: [string, Function][];

      if (target.__methodMap) {
        methodEntries = [...target.__methodMap, [name, method]];
      } else {
        methodEntries = [[name, method]];
      }

      Object.defineProperty(target, '__methodMap', {
        value: new Map(methodEntries),
      });
    }
  };
}
