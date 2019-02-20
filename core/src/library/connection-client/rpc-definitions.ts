import {ChangePacket} from '../change';
import {SyncableRef} from '../syncable';

import {SyncData, SyncUpdateSource} from './sync';

////////////////
// Connection //
////////////////

export type ConnectionRPCDefinition =
  | ConnectionChangeRPCDefinition
  | ConnectionRequestRPCDefinition
  | ConnectionUpdateViewQueryRPCDefinition;

export interface ConnectionChangeRPCDefinition {
  name: 'apply-change';
  args: [ChangePacket];
  return: void;
}

export interface ConnectionRequestRPCDefinition {
  name: 'request-syncables';
  args: [SyncableRef[]];
  return: void;
}

export interface ConnectionUpdateViewQueryRPCDefinition {
  name: 'update-view-query';
  args: [object];
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
   * [syncing data, context ref, default viewQuery dict]
   */
  args: [SyncData, SyncableRef, object];
  return: void;
}

export interface ClientSyncRPCDefinition {
  name: 'sync';
  args: [SyncData, SyncUpdateSource?];
  return: void;
}
