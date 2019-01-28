import {ChangePacket} from '../change';
import {SyncableRef} from '../syncable';

import {SyncData, SyncUpdateSource} from './sync';
import {UpdateViewQueryObject} from './view-query';

////////////////
// Connection //
////////////////

export type ConnectionRPCDefinition =
  | ConnectionChangeRPCDefinition
  | ConnectionRequestRPCDefinition
  | ConnectionUpdateViewQueryRPCDefinition;

export interface ConnectionChangeRPCDefinition {
  name: 'change';
  args: [ChangePacket];
  return: void;
}

export interface ConnectionRequestRPCDefinition {
  name: 'request';
  args: [SyncableRef[]];
  return: void;
}

export interface ConnectionUpdateViewQueryRPCDefinition {
  name: 'update-view-query';
  args: [UpdateViewQueryObject];
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
  args: [SyncData, unknown];
  return: void;
}

export interface ClientSyncRPCDefinition {
  name: 'sync';
  args: [SyncData, SyncUpdateSource?];
  return: void;
}
