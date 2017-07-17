import {
  BroadcastChange,
  Change,
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

export abstract class SyncableDefinition
  <TSyncable extends Syncable, TSubscription extends Subscription, TServer extends Server> {
  /** @internal */
  _server: TServer;

  get server(): TServer {
    return this._server;
  }

  async loadSnapshotsUponRequest(
    _resources: string[],
    _subscription: TSubscription,
    _socket: Socket,
  ): Promise<TSyncable[]> {
    return [];
  }

  abstract hasSubscribedChange(change: BroadcastChange, subscription: TSubscription, socket: Socket): boolean;
  abstract testVisibility(object: TSyncable, subscription: TSubscription, socket: Socket): Visibility;

  abstract async loadSnapshots(subscription: TSubscription, socket: Socket): Promise<TSyncable[]>;
  abstract async loadChanges(subscription: TSubscription, socket: Socket): Promise<BroadcastChange[]>;

  abstract async create(change: ServerCreation, timestamp: number): Promise<TSyncable>;
  abstract async update(change: Change, timestamp: number): Promise<TSyncable | undefined>;
  abstract async remove(change: Removal, timestamp: number): Promise<void>;
}
