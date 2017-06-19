import {
  BroadcastChange,
  BroadcastCreation,
  BroadcastRemoval,
  Subscription,
  Syncable,
} from 'syncable';

export abstract class Definition<TSubscription extends Subscription, TSyncable extends Syncable> {
  abstract async loadSnapshots(subscription: TSubscription): Promise<TSyncable[]>;
  abstract hasSubscribedChange(change: BroadcastChange, subscription: TSubscription): boolean;

  abstract async create(change: BroadcastCreation): Promise<TSyncable>;
  abstract async remove(change: BroadcastRemoval): Promise<undefined>;
  abstract async update(change: BroadcastChange): Promise<undefined>;

  async mergeChange(change: BroadcastChange): Promise<TSyncable | undefined> {
    switch (change.type) {
      case 'create':
        return this.create(change as BroadcastCreation);
      case 'remove':
        return this.remove(change as BroadcastRemoval);
      default:
        return this.update(change);
    }
  }
}
