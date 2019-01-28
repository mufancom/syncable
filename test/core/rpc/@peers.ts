import {RPCError, RPCMethod, RPCPeer, RPCPeerType} from '@syncable/core';

export type ThisDefinition = ThisFooDefinition | ThisBarDefinition;

export interface ThisFooDefinition {
  name: 'foo';
  args: [string, number];
  return: string;
}

export interface ThisBarDefinition {
  name: 'bar';
  args: [boolean];
  return: void;
}

export class ThisPeer extends RPCPeer<ThatDefinition>
  implements RPCPeerType<ThisDefinition> {
  @RPCMethod()
  foo(text: string, length: number): string {
    return text.slice(0, length);
  }

  @RPCMethod()
  bar(condition: boolean): void {
    if (condition) {
      throw new RPCError('BAR_ERROR', 'Bar error occurred');
    }
  }
}

export type ThatDefinition = ThatYohaDefinition;

export interface ThatYohaDefinition {
  name: 'yoha';
  args: [string, number];
  return: string;
}

export class ThatPeer extends RPCPeer<ThisDefinition>
  implements RPCPeerType<ThatDefinition> {
  @RPCMethod()
  yoha(text: string, length: number): string {
    return text.slice(0, length);
  }
}
