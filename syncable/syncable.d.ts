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

export interface RawRemoval {
  subject: string;
  resource: string;
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

export interface Removal extends RawRemoval {
  uid: string;
  type: 'remove';
}

export interface BroadcastChange extends Change {
  timestamp: number;
  snapshot?: Syncable | undefined;
}

export interface BroadcastCreation extends BroadcastChange {
  type: 'create';
  snapshot: Syncable;
}

export interface BroadcastRemoval extends Change {
  type: 'remove';
  timestamp: number;
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
  /** Loaded syncable UIDs. */
  loaded?: string[];
}

export interface SnapshotsData extends Subscription {
  snapshots: Syncable[];
}
