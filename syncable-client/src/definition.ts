import {
  Change,
  ClientCreation,
  RawChange,
  RawSubscription,
  Syncable,
} from 'syncable';

// import {Store} from './store';

export interface ResourceStoreItem<T extends Syncable> {
  changes: Change[];
  object: T;
}

export abstract class SyncableDefinition<T extends Syncable> {
  // TODO:
  // abstract getChangesStore(): Store<Change>;
  // abstract getSnapshotsStore(): Store<T>;

  abstract generateSubscription(): RawSubscription;
  abstract preprocessChange(change: RawChange): void;
  abstract testVisibility(object: T): boolean;

  abstract create(change: ClientCreation): T;
  abstract update(object: T, change: Change): T;
}
