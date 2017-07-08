import { EventEmitter } from 'events';

import {
  BroadcastChange,
  BroadcastCreation,
  BroadcastRemoval,
  Change,
  Creation,
  Removal,
  SnapshotsData,
  Subscription,
  Syncable,
} from 'syncable';

import { SyncableDefinition } from './definition';

export interface ResourceLock {
  release(): PromiseLike<void>;
}

export interface SubscriptionInfo {
  subscription: Subscription;
  postponeChanges: boolean;
  changes: BroadcastChange[];
  visibleSet: Set<string>;
  valid: boolean;
}

export interface Socket extends SocketIO.Socket {
  subjectToSubscriptionInfoMap: Map<string, SubscriptionInfo>;

  on(event: 'change', listener: (change: Change) => void): this;
  on(event: 'subscribe', listener: (subscription: Subscription) => void): this;
  on(event: 'close', listener: () => void): this;

  emit(event: 'subscribed', data: Subscription): boolean;
  emit(event: 'change', change: BroadcastChange): boolean;
  emit(event: 'snapshots', data: SnapshotsData): boolean;
}

export interface SocketServer extends SocketIO.Server {
  on(event: 'connection' | 'connect', listener: (socket: Socket) => void): SocketIO.Namespace;
}

export abstract class Server extends EventEmitter {
  private errorEmitter: (error: any) => void = this.emit.bind(this, 'error');

  private subjectToDefinitionMap = new Map<string, SyncableDefinition<Syncable, Subscription, this>>();
  private subjectToSocketSetMap = new Map<string, Set<Socket>>();

  constructor(
    private socketServer: SocketServer,
  ) {
    super();

    this.initChangeQueueListener();
    this.initSocketServer();
  }

  abstract async lock(resource: string, ttl: number): Promise<ResourceLock>;
  abstract async generateTimestamp(): Promise<number>;
  abstract async queueChange(change: BroadcastChange): Promise<void>;

  register(subject: string, definition: SyncableDefinition<Syncable, Subscription, this>): void {
    definition._server = this;
    this.subjectToDefinitionMap.set(subject, definition);
  }

  async spawnChange<T extends Change>(change: T): Promise<void>;
  async spawnChange(change: Change): Promise<void> {
    let definition = this.subjectToDefinitionMap.get(change.subject)!;

    let lock = await this.lock(`resource-${change.resource}`, 1000);

    try {
      let timestamp = await this.generateTimestamp();
      let snapshot: Syncable | undefined;
      let broadcastChange: BroadcastChange;

      let {type} = change;

      if (type === 'create') {
        snapshot = await definition.create(change as Creation, timestamp);
        broadcastChange = {snapshot, timestamp, ...change};
      } else if (type === 'remove') {
        await definition.remove(change as Removal, timestamp);
        broadcastChange = {timestamp, ...change};
      } else {
        snapshot = await definition.update(change, timestamp);
        broadcastChange = {snapshot, timestamp, ...change};
      }

      await this.queueChange(broadcastChange);
    } finally {
      await lock.release();
    }
  }

  private initChangeQueueListener(): void {
    this.on('change', change => {
      try {
        this.handleChangeFromQueue(change);
      } catch (error) {
        this.emit('error', error);
      }
    });
  }

  private initSocketServer(): void {
    this.socketServer.on('connect', socket => {
      socket.subjectToSubscriptionInfoMap = new Map<string, SubscriptionInfo>();

      socket.on('subscribe', subscription => {
        let {subjectToSubscriptionInfoMap} = socket;
        let {subject, timestamp, loaded} = subscription;

        let existingInfo = subjectToSubscriptionInfoMap.get(subject);

        if (existingInfo) {
          existingInfo.valid = false;
        }

        let info: SubscriptionInfo = {
          subscription,
          postponeChanges: false,
          changes: [],
          visibleSet: new Set<string>(loaded),
          valid: true,
        };

        subjectToSubscriptionInfoMap.set(subject, info);

        let {subjectToSocketSetMap} = this;

        if (subjectToSocketSetMap.has(subject)) {
          subjectToSocketSetMap.get(subject)!.add(socket);
        } else {
          subjectToSocketSetMap.set(subject, new Set([socket]));
        }

        socket.emit('subscribed', subscription);

        if (typeof timestamp === 'number') {
          this.loadAndEmitChanges(socket, info).catch(this.errorEmitter);
        } else {
          this.loadAndEmitSnapshots(socket, info).catch(this.errorEmitter);
        }
      });

      socket.on('change', change => {
        this.spawnChange(change).catch(this.errorEmitter);
      });

      socket.on('close', () => {
        for (let subject of socket.subjectToSubscriptionInfoMap.keys()) {
          this.subjectToSocketSetMap.get(subject)!.delete(socket);
        }
      });
    });
  }

  private async loadAndEmitSnapshots(socket: Socket, info: SubscriptionInfo): Promise<void> {
    info.postponeChanges = true;

    let {subscription, visibleSet} = info;

    let definition = this.subjectToDefinitionMap.get(subscription.subject)!;

    let snapshotsTimestamp = await this.generateTimestamp();

    let snapshots = await definition.loadSnapshots(subscription);

    if (!info.valid) {
      return;
    }

    for (let {uid, timestamp} of snapshots) {
      visibleSet.add(uid);
      snapshotsTimestamp = Math.max(snapshotsTimestamp, timestamp);
    }

    let data: SnapshotsData = {
      snapshots,
      timestamp: snapshotsTimestamp,
      ...subscription,
    };

    socket.emit('snapshots', data);

    let resourceToTimestampMap = new Map<string, number>();

    for (let {uid, timestamp} of snapshots) {
      resourceToTimestampMap.set(uid, timestamp);
    }

    for (let change of info.changes) {
      let timestamp = resourceToTimestampMap.get(change.resource);

      if (!timestamp || timestamp < change.timestamp) {
        socket.emit('change', change);
      }
    }

    info.changes = [];
    info.postponeChanges = false;
  }

  private async loadAndEmitChanges(socket: Socket, info: SubscriptionInfo): Promise<void> {
    info.postponeChanges = true;

    let {subscription} = info;

    let definition = this.subjectToDefinitionMap.get(subscription.subject)!;

    let changes = await definition.loadChanges(subscription);

    if (!info.valid) {
      return;
    }

    for (let change of changes) {
      socket.emit('change', change);
    }

    let latestTimestamp = changes.length ? changes[changes.length - 1].timestamp : 0;

    let {changes: postponedChanges} = info;

    for (let change of postponedChanges) {
      if (change.timestamp > latestTimestamp) {
        socket.emit('change', change);
      }
    }

    info.postponeChanges = false;
  }

  private handleChangeFromQueue(change: BroadcastChange): void {
    let {subject, resource, type, snapshot} = change;

    let socketSet = this.subjectToSocketSetMap.get(subject);

    if (!socketSet) {
      return;
    }

    let definition = this.subjectToDefinitionMap.get(subject)!;

    for (let socket of socketSet) {
      let {subjectToSubscriptionInfoMap} = socket;
      let {subscription, changes, postponeChanges, visibleSet} = subjectToSubscriptionInfoMap.get(subject)!;

      if (!definition.hasSubscribedChange(change, subscription)) {
        continue;
      }

      let changeToBroadcast: BroadcastChange;

      if (type === 'remove') {
        if (visibleSet.has(resource)) {
          visibleSet.delete(resource);
          changeToBroadcast = change;
        } else {
          continue;
        }
      } else if (type === 'create') {
        if (definition.testVisibility(snapshot!, subscription)) {
          visibleSet.add(resource);
          changeToBroadcast = pruneAsBroadcastCreation(change);
        } else {
          continue;
        }
      } else {
        if (definition.testVisibility(snapshot!, subscription)) {
          if (visibleSet.has(resource)) {
            let {snapshot: _, ...changeWithoutSnapshot} = change;
            changeToBroadcast = changeWithoutSnapshot;
          } else {
            visibleSet.add(resource);
            changeToBroadcast = pruneAsBroadcastCreation(change);
          }
        } else {
          if (visibleSet.has(resource)) {
            visibleSet.delete(resource);
            changeToBroadcast = pruneAsBroadcastRemoval(change);
          } else {
            continue;
          }
        }
      }

      if (postponeChanges) {
        changes.push(changeToBroadcast);
      } else {
        socket.emit('change', changeToBroadcast);
      }
    }
  }
}

export interface Server {
  on(event: 'change', listener: (change: BroadcastChange) => void): this;
  on(event: 'error', listener: (error: any) => void): this;

  emit(event: 'change', change: BroadcastChange): boolean;
  emit(event: 'error', error: any): boolean;
}

function pruneAsBroadcastCreation({
  uid,
  subject,
  resource,
  snapshot,
  timestamp,
}: BroadcastChange): BroadcastCreation {
  return {
    uid,
    subject,
    resource,
    type: 'create',
    snapshot: snapshot!,
    timestamp,
  };
}

function pruneAsBroadcastRemoval({
  uid,
  subject,
  resource,
  timestamp,
}: BroadcastChange): BroadcastRemoval {
  return {
    uid,
    subject,
    resource,
    type: 'remove',
    timestamp,
  };
}
