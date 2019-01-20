import {RPCError, RPCFunctionDict} from '@syncable/core';

export const thisFunctionDict: RPCFunctionDict<ThisDefinition> = {
  foo(text, length) {
    return text.slice(0, length);
  },
  bar(condition) {
    if (condition) {
      throw new RPCError('BAR_ERROR', 'Bar error occurred');
    }
  },
};

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

export const thatFunctionDict: RPCFunctionDict<ThatDefinition> = {
  yoha(text, length) {
    return text.slice(0, length);
  },
};

export type ThatDefinition = ThatYohaDefinition;

export interface ThatYohaDefinition {
  name: 'yoha';
  args: [string, number];
  return: string;
}
