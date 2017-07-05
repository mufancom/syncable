import {
  BroadcastChange,
  BroadcastCreation,
  BroadcastRemoval,
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

  abstract async loadSnapshots(subscription: TSubscription): Promise<TSyncable[]>;
  abstract async loadChanges(subscription: TSubscription): Promise<BroadcastChange[]>;

  abstract async create(change: BroadcastCreation): Promise<TSyncable>;
  abstract async update(change: BroadcastChange): Promise<undefined>;
  abstract async remove(change: BroadcastRemoval): Promise<void>;

  async mergeChange(change: BroadcastChange): Promise<TSyncable | undefined> {
    switch (change.type) {
      case 'create':
        return await this.create(change as BroadcastCreation);
      case 'remove':
        await this.remove(change as BroadcastRemoval);
        return undefined;
      default:
        return await this.update(change);
    }
  }
}
