import {Client} from '@syncable/client';
import {ISyncableAdapter, RPCData, SyncableRef} from '@syncable/core';
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
import {User, UserId} from './syncables';

export function createServer(
  connection$: Subject<Connection<ServerGenericParams>>,
  broadcastSource$: Subject<BroadcastChangeResult>,
): Server<ServerGenericParams> {
  let context = new Context('server', 'server', undefined!);

  let serverAdapter = new ServerAdapter(connection$, broadcastSource$);

  return new Server(
    context,
    serverAdapter,
    syncableAdapter as ISyncableAdapter<ServerGenericParams>,
    blueprint,
  );
}

export function createClientConnectionPair(
  server: Server<ServerGenericParams>,
  group: string,
  userId: UserId,
): [Client<ClientGenericParams>, Connection<ServerGenericParams>, () => void] {
  let clientToConnection$ = new Subject<RPCData>();
  let connectionToClient$ = new Subject<RPCData>();

  let userRef: SyncableRef<User> = {
    type: 'user',
    id: userId,
  };

  let clientContext = new Context('user', 'client', userRef);
  let clientAdapter = new ClientAdapter(
    group,
    connectionToClient$,
    clientToConnection$,
  );

  let client = new Client<ClientGenericParams>(
    clientContext,
    clientAdapter,
    syncableAdapter as ISyncableAdapter<ClientGenericParams>,
    blueprint,
  );

  let connectionAdapter = new ConnectionAdapter(
    group,
    userRef,
    clientToConnection$,
    connectionToClient$,
  );

  let connection = new Connection(
    server,
    group,
    connectionAdapter,
    syncableAdapter,
  );

  clientAdapter.connect$.next();

  return [
    client,
    connection,
    () => {
      clientToConnection$.complete();
      connectionToClient$.complete();
    },
  ];
}
