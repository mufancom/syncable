import {
  ChangePacket,
  InitialData,
  RPCCallData,
  RPCDefinition,
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
  on(event: 'syncable:return', listener: (data: any) => void): this;

  emit(event: 'syncable:view-query', query: unknown): this;
  emit(event: 'syncable:change', packet: ChangePacket): this;
  emit(event: 'syncable:request', ref: SyncableRef): this;
  emit<TRPCDefinition extends RPCDefinition>(
    event: 'syncable:call',
    data: RPCCallData<TRPCDefinition['name'], TRPCDefinition['call']>,
  ): this;
}
