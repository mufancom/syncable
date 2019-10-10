import {Dict} from 'tslang';

import {ChangePacket} from '../change';
import {SyncableRef} from '../syncable';

import {SyncData, SyncUpdateSource} from './sync';
import {IViewQuery, ViewQueryUpdateObject} from './view-query';

////////////////
// Connection //
////////////////

export type ConnectionRPCDefinition =
  | ConnectionInitializeRPCDefinition
  | ConnectionChangeRPCDefinition
  | ConnectionRequestRPCDefinition
  | ConnectionUpdateViewQueryRPCDefinition;

export interface ConnectionInitializeRPCDefinition {
  name: 'initialize';
  args: [Dict<IViewQuery>];
  return: void;
}

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
  args: [ViewQueryUpdateObject];
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
  args: [SyncData, SyncableRef, ViewQueryUpdateObject];
  return: void;
}

export interface ClientSyncRPCDefinition {
  name: 'sync';
  args: [SyncData, SyncUpdateSource?];
  return: void;
}
