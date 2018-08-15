import {
  ChangePacket,
  InitialData,
  SyncingData,
  UserSyncableObject,
} from '@syncable/core';
import io from 'socket.io-client';

export interface ClientSocket<TUser extends UserSyncableObject>
  extends SocketIOClient.Socket {
  on(event: 'reconnect', listener: (attempt: number) => void): this;

  on(event: 'initialize', listener: (data: InitialData<TUser>) => void): this;

  on(event: 'sync', listener: (data: SyncingData) => void): this;

  emit(event: 'change', packet: ChangePacket): this;

  emit(event: 'request', request: Request): this;
}

export function createClientSocket<TUser extends UserSyncableObject>(
  uri: string,
): ClientSocket<TUser> {
  return io(uri, {transports: ['websocket']}) as ClientSocket<TUser>;
}
