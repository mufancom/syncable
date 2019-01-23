import {IContext, IRPCAdapter} from '@syncable/core';

export interface IConnectionSource extends IRPCAdapter {
  group: string;
  context: IContext;
}
