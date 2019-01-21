///////////////////////
// Server Connection //
///////////////////////

export type ServerConnectionRPCDefinition =
  | ServerConnectionChangeRPCDefinition
  | ServerConnectionRequestRPCDefinition
  | ServerConnectionUpdateViewQueryRPCDefinition;

export interface ServerConnectionChangeRPCDefinition {
  name: 'change';
  args: [];
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

export type ClientRPCDefinition = ClientSyncRPCDefinition;

export interface ClientSyncRPCDefinition {
  name: 'sync';
  args: [];
  return: void;
}
