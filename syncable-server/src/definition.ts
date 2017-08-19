import {
  BroadcastChange,
  Change,
  ClientBroadcastChangeData,
  QueuedBroadcastChange,
  Removal,
  ServerCreation,
  Subscription,
  Syncable,
} from 'syncable';

import {
  Server,
  Socket,
  Visibility,
} from './server';

export abstract class SyncableDefinition<
  TSyncable extends Syncable,
  TSubscription extends Subscription,
  TSession,
  TClientSession,
  TServer extends Server<TSession, TClientSession>> {
  /** @internal */
  _server: TServer;

  get server(): TServer {
    return this._server;
  }

  pruneBroadcastChange(change: QueuedBroadcastChange): BroadcastChange {
    let {snapshot: _, ...broadcastChange} = change;
    return broadcastChange;
  }

  async loadSnapshotsUponRequest(
    _resources: string[],
    _subscription: TSubscription,
    _socket: Socket<TClientSession>,
  ): Promise<TSyncable[]> {
    return [];
  }

  abstract onChange(
    change: BroadcastChange,
    changeSession: TSession,
    subscription: TSubscription,
    socket: Socket<TClientSession>,
  ): boolean;

  abstract testVisibility(
    object: TSyncable,
    subscription: TSubscription,
    socket: Socket<TClientSession>,
  ): Visibility;

  abstract async loadSnapshots(
    subscription: TSubscription,
    socket: Socket<TClientSession>,
  ): Promise<TSyncable[]>;

  abstract async loadChanges(
    subscription: TSubscription,
    socket: Socket<TClientSession>,
  ): Promise<ClientBroadcastChangeData<BroadcastChange, TClientSession>[]>;

  abstract async create(change: ServerCreation, timestamp: number, session: TSession): Promise<TSyncable>;
  abstract async update(change: Change, timestamp: number, session: TSession): Promise<TSyncable>;
  abstract async remove(change: Removal, timestamp: number, session: TSession): Promise<void>;
}
