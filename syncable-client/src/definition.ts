import {
  Change,
  Creation,
  RawSubscription,
  Syncable,
} from 'syncable';

// import {Store} from './store';

export interface ResourceStoreItem<T extends Syncable> {
  changes: Change[];
  object: T;
}

export abstract class Definition<T extends Syncable> {
  // TODO:
  // abstract getChangesStore(): Store<Change>;
  // abstract getSnapshotsStore(): Store<TSyncable>;

  abstract generateSubscription(): RawSubscription;
  abstract create(change: Creation): T;
  abstract update(object: T, change: Change): T;
}
