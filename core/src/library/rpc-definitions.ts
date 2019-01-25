import {ChangePacket} from './change';
import {SyncingData, SyncingUpdateSource} from './types';

///////////////////////
// Server Connection //
///////////////////////

export type ServerConnectionRPCDefinition =
  | ServerConnectionChangeRPCDefinition
  | ServerConnectionRequestRPCDefinition
  | ServerConnectionUpdateViewQueryRPCDefinition;

export interface ServerConnectionChangeRPCDefinition {
  name: 'change';
  args: [ChangePacket];
  return: void;
}

export interface ServerConnectionRequestRPCDefinition {
  name: 'request';
  args: [];
  return: void;
}

export interface ServerConnectionUpdateViewQueryRPCDefinition {
  name: 'update-view-query';
  args: [];
  return: void;
}

////////////
// Client //
////////////

export type ClientRPCDefinition =
  | ClientInitializeRPCDefinition
  | ClientSyncRPCDefinition;

export interface ClientInitializeRPCDefinition {
  name: 'initialize';
  /**
   * [syncing data, context data]
   */
  args: [SyncingData, unknown];
  return: void;
}

export interface ClientSyncRPCDefinition {
  name: 'sync';
  args: [SyncingData, SyncingUpdateSource];
  return: void;
}
