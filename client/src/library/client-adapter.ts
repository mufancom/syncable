import {ChangePacketId, IRPCAdapter} from '@syncable/core';

import {IClientGenericParams} from './client';

export interface IClientAdapter<TGenericParams extends IClientGenericParams>
  extends IRPCAdapter {
  handleNotifications(
    notifications: TGenericParams['notification'][],
    id: ChangePacketId,
  ): void;
}
