import {IContext, IRPCAdapter} from '@syncable/core';

import {IServerGenericParams} from '../server';

export interface IConnectionAdapter<
  TGenericParams extends IServerGenericParams
> extends IRPCAdapter {
  group: string;
  context: IContext;
  viewQueryDict: Partial<TGenericParams['viewQueryDict']>;

  close(): void;
}
