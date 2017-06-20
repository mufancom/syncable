// tslint:disable:no-empty-interface

export interface Syncable {
  /** Unique identifier of this resource. */
  uid: string;
  /** Timestamp. */
  timestamp: number;
}

export interface RawChange {
  /** Subject of this change. */
  subject: string;
  /** Change type. */
  type: string;
  /** Resource that this change targets to. */
  resource: string;
}

export interface RawCreation {
  subject: string;
}

export interface Change extends RawChange {
  /** Unique identifier of this change. */
  uid: string;
}

export interface Creation extends RawCreation {
  uid: string;
  resource: string;
  type: 'create';
}

export interface Removal extends Change {
  type: 'remove';
}

export interface BroadcastChange extends Change {
  timestamp: number;
  snapshot?: Syncable;
}

export interface BroadcastCreation extends BroadcastChange {
  type: 'create';
}

export interface BroadcastRemoval extends BroadcastChange {
  type: 'remove';
}

export interface RawSubscription {
}

export interface Subscription extends RawSubscription {
  /** Subject to subscribe. */
  subject: string;
  /** Unique identifier of this subscription. */
  uid: string;
  /** Specify timestamp to skip snapshots. */
  timestamp?: number;
}

export interface SnapshotsData extends Subscription {
  snapshots: Syncable[];
}
