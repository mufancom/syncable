import {
  AbstractUserSyncableObject,
  ChangePacket,
  InitialData,
  SyncingData,
} from '@syncable/core';

export interface ClientSocket<TUser extends AbstractUserSyncableObject>
  extends SocketIOClient.Socket {
  on(event: 'reconnect', listener: (attempt: number) => void): this;

  on(event: 'initialize', listener: (data: InitialData<TUser>) => void): this;

  on(event: 'sync', listener: (data: SyncingData) => void): this;

  emit(event: 'change', packet: ChangePacket): this;

  emit(event: 'request', request: Request): this;
}
