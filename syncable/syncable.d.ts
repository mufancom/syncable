export interface Syncable {
  /** Unique identifier of this resource. */
  uid: string;
  /** Timestamp. */
  timestamp: number;
}

export interface Change {
  /** Unique identifier of this change. */
  uid: string;
  /** Subject of this change. */
  subject: string;
  /** Change type. */
  type: string;
  /** Resource that this change targets to. */
  resource: string;
}

export interface BroadcastChange extends Change {
  timestamp: number;
}

export interface BroadcastCreation extends BroadcastChange {
  type: 'create';
}

export interface BroadcastRemoval extends BroadcastChange {
  type: 'remove';
}

export interface Subscription {
  /** Unique identifier of this subscription. */
  uid: string;
  /** Subject to subscribe. */
  subject: string;
}

export interface IncrementalSubscription extends Subscription {
  /** Specify timestamp to skip snapshots. */
  timestamp: number;
}

export type GeneralSubscription = Subscription | IncrementalSubscription;

export interface SnapshotsData extends Subscription {
  snapshots: Syncable[];
}
