import {
  ChangePacket,
  IUserSyncableObject,
  InitialData,
  SyncingData,
} from '@syncable/core';

export interface ClientSocket<TUser extends IUserSyncableObject>
  extends SocketIOClient.Socket {
  on(event: 'syncable:reconnect', listener: (attempt: number) => void): this;

  on(
    event: 'syncable:initialize',
    listener: (data: InitialData<TUser>) => void,
  ): this;

  on(event: 'syncable:sync', listener: (data: SyncingData) => void): this;

  emit(event: 'syncable:change', packet: ChangePacket): this;

  emit(event: 'syncable:request', request: Request): this;
}
