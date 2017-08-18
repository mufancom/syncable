// tslint:disable:no-empty-interface

export interface Syncable {
  /** Unique identifier of this resource. */
  uid: string;
  /** Timestamp. */
  timestamp: number;
  syncing?: boolean;
}

/*
 * Creation/Removal/Change transformations explanation:
 *
 * RawCreation
 *   | server-only: client.create() + uid + type + resource? -> ServerCreation
 *   | both-end: client.create() + uid + type + resource -> ClientCreation
 * ClientCreation
 *   | server.spawnChange() => ServerCreation
 * ServerCreation
 *   | server.spawnChange() + resource! + snapshot + timestamp - ... -> QueuedBroadcastCreation
 * QueuedBroadcastCreation
 *   | server.handleChangeFromQueue() => BroadcastCreation
 * BroadcastCreation
 *
 * RawRemoval
 *   | client.remove() + uid + type -> Removal
 * Removal
 *   | server.spawnChange() + timestamp -> QueuedBroadcastRemoval
 * QueuedBroadcastRemoval
 *   | server.handleChangeFromQueue() => BroadcastRemoval
 * BroadcastRemoval
 *
 * RawChange
 *   | client.update() + uid -> Change
 * Change
 *   | server.spawnChange() + snapshot + timestamp -> QueuedBroadcastChange
 * QueuedBroadcastChange
 *   | server.handleChangeFromQueue() - snapshot -> BroadcastChange
 *   | server.handleChangeFromQueue() - ... -> BroadcastCreation
 *   | server.handleChangeFromQueue() - ... -> BroadcastRemoval
 * BroadcastChange
 */

export type GeneralChange = ClientCreation | ServerCreation | Removal | Change;
export type GeneralQueuedBroadcastChange = QueuedBroadcastCreation | QueuedBroadcastRemoval | QueuedBroadcastChange;

// create

export interface RawCreation {
  subject: string;
}

export interface ServerCreation extends RawCreation {
  uid: string;
  resource?: string;
  type: 'create';
}

export interface ClientCreation extends RawCreation {
  uid: string;
  resource: string;
  type: 'create';
}

export interface BroadcastCreation extends ServerCreation {
  resource: string;
  snapshot: Syncable;
  timestamp: number;
}

export interface QueuedBroadcastCreation extends BroadcastCreation { }

// remove

export interface RawRemoval {
  subject: string;
  resource: string;
}

export interface Removal extends RawRemoval {
  uid: string;
  type: 'remove';
}

export interface BroadcastRemoval extends Removal {
  timestamp: number;
}

export interface QueuedBroadcastRemoval extends BroadcastRemoval { }

// change

export interface RawChange {
  /** Subject of this change. */
  subject: string;
  /** Change type. */
  type: string;
  /** Resource that this change targets to. */
  resource: string;
}

export interface Change extends RawChange {
  /** Unique identifier of this change. */
  uid: string;
}

export interface QueuedBroadcastChange extends Change {
  timestamp: number;
  snapshot: Syncable;
}

export interface BroadcastChange extends Change {
  timestamp: number;
}

export interface ClientBroadcastChangeData<TBroadcastChange extends BroadcastChange, TClientSession> {
  change: TBroadcastChange;
  session: TClientSession | undefined;
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
  timestamp: number;
}

export interface Request {
  subject: string;
  resources: string[];
}
