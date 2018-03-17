import {
  Change,
  ClientCreation,
  RawChange,
  RawSubscription,
  Syncable,
} from 'syncable';

export interface ResourceStoreItem<T extends Syncable> {
  changes: Change[];
  object: T;
}

export abstract class SyncableDefinition<T extends Syncable, TClientSession> {
  /** Override to customize. */
  generateSubscription(): RawSubscription {
    return {};
  }

  /** Override to customize. */
  preprocessChange(_change: RawChange): void {}

  /** Override to customize. */
  testVisibility(_object: T): boolean {
    return true;
  }

  abstract create(change: ClientCreation, session: TClientSession): T;
  abstract update(object: T, change: Change, session: TClientSession): T;
}
