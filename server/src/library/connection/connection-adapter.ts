import {IContext, IRPCAdapter} from '@syncable/core';

export interface IConnectionAdapter extends IRPCAdapter {
  group: string;
  context: IContext;
}
