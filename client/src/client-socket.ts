import {
  ChangePacket,
  ConsequentSeries,
  SnapshotEventData,
} from '@syncable/core';
import io = require('socket.io-client');

export interface ClientSocket extends SocketIOClient.Socket {
  on(event: 'reconnect', listener: (attempt: number) => void): this;

  on(
    event: 'consequent-series',
    listener: (series: ConsequentSeries) => void,
  ): this;

  on(event: 'snapshot', listener: (snapshot: SnapshotEventData) => void): this;

  emit(event: 'change', packet: ChangePacket): this;

  emit(event: 'request', request: Request): this;
}

export function createClientSocket(): ClientSocket {
  return io('/', {transports: ['websocket']}) as ClientSocket;
}
