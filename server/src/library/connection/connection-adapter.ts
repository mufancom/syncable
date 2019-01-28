import {IContext, IRPCAdapter} from '@syncable/core';

import {IServerGenericParams} from '../server';

export interface IConnectionAdapter<
  TGenericParams extends IServerGenericParams
> extends IRPCAdapter {
  group: string;
  context: IContext;
  viewQuery: TGenericParams['viewQuery'];
}
