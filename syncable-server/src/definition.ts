import {
  BroadcastChange,
  Change,
  Creation,
  Removal,
  Subscription,
  Syncable,
} from 'syncable';

import { Server } from './server';

export abstract class SyncableDefinition
  <TSyncable extends Syncable, TSubscription extends Subscription, TServer extends Server> {
  /** @internal */
  _server: TServer;

  get server(): TServer {
    return this._server;
  }

  abstract hasSubscribedChange(change: BroadcastChange, subscription: TSubscription): boolean;
  abstract testVisibility(object: TSyncable, subscription: TSubscription): boolean;

  abstract async loadSnapshots(subscription: TSubscription): Promise<TSyncable[]>;
  abstract async loadChanges(subscription: TSubscription): Promise<BroadcastChange[]>;

  abstract async create(change: Creation, timestamp: number): Promise<TSyncable>;
  abstract async update(change: Change, timestamp: number): Promise<TSyncable | undefined>;
  abstract async remove(change: Removal, timestamp: number): Promise<void>;
}
