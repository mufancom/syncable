import {
  ClientRPCDefinition,
  RPCPeer,
  ServerConnectionRPCDefinition,
} from '@syncable/core';

export class Client extends RPCPeer<
  ClientRPCDefinition,
  ServerConnectionRPCDefinition
> {}
