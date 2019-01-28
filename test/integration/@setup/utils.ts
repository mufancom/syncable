import {Client} from '@syncable/client';
import {RPCData} from '@syncable/core';
import {BroadcastChangeResult, Connection, Server} from '@syncable/server';
import {Subject} from 'rxjs';

import {blueprint} from './changes';
import {ClientGenericParams} from './client';
import {ClientAdapter} from './client-adapter';
import {ConnectionAdapter} from './connection-adapter';
import {Context} from './context';
import {ServerGenericParams} from './server';
import {ServerAdapter} from './server-adapter';
import {syncableAdapter} from './syncable-adapter';
import {UserId} from './syncables';

export function createServer(
  connection$: Subject<Connection<ServerGenericParams>>,
  broadcastSource$: Subject<BroadcastChangeResult>,
): Server<ServerGenericParams> {
  let context = new Context('server', 'server', undefined!);

  let serverAdapter = new ServerAdapter(connection$, broadcastSource$);

  return new Server(context, serverAdapter, syncableAdapter, blueprint);
}

export function createClientConnectionPair(
  server: Server<ServerGenericParams>,
  group: string,
  userId: UserId,
): [Client<ClientGenericParams>, Connection<ServerGenericParams>, () => void] {
  let clientToConnection$ = new Subject<RPCData>();
  let connectionToClient$ = new Subject<RPCData>();

  let clientContext = new Context('user', 'client', userId);
  let clientAdapter = new ClientAdapter(
    group,
    userId,
    connectionToClient$,
    clientToConnection$,
  );

  let client = new Client<ClientGenericParams>(
    clientContext,
    clientAdapter,
    syncableAdapter,
    blueprint,
  );

  let connectionContext = new Context('user', 'server', userId);

  let connectionAdapter = new ConnectionAdapter(
    group,
    userId,
    clientToConnection$,
    connectionToClient$,
  );

  let connection = new Connection(
    server,
    group,
    connectionContext,
    connectionAdapter,
    syncableAdapter,
  );

  return [
    client,
    connection,
    () => {
      clientToConnection$.complete();
      connectionToClient$.complete();
    },
  ];
}
