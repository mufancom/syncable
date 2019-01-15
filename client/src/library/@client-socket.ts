import {
  ChangePacket,
  InitialData,
  RPCCallData,
  RPCCallResult,
  SyncableRef,
  SyncingData,
} from '@syncable/core';

export interface ClientSocket extends SocketIOClient.Socket {
  on(event: 'syncable:initialize', listener: (data: InitialData) => void): this;
  on(event: 'syncable:sync', listener: (data: SyncingData) => void): this;
  on(
    event: 'syncable:complete-requests',
    listener: (refs: SyncableRef[]) => void,
  ): this;
  on(
    event: 'syncable:complete-call',
    listener: (result: RPCCallResult) => void,
  ): this;

  emit(event: 'syncable:view-query', query: unknown): this;
  emit(event: 'syncable:change', packet: ChangePacket): this;
  emit(event: 'syncable:request', ref: SyncableRef): this;
  emit(event: 'syncable:call', data: RPCCallData): this;
}
