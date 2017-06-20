import {EventEmitter} from 'events';

import {
  BroadcastChange,
  Change,
  SnapshotsData,
  Subscription,
  Syncable,
} from 'syncable';

import {Definition} from './definition';

export interface ResourceLock {
  unlock(): PromiseLike<void>;
}

export interface SubscriptionInfo {
  subscription: Subscription;
  postponeChanges: boolean;
  changes: BroadcastChange[];
  valid: boolean;
}

export interface Socket extends SocketIO.Socket {
  subjectToSubscriptionInfoMap: Map<string, SubscriptionInfo>;

  on(event: 'change', listener: (change: Change) => void): this;
  on(event: 'subscribe', listener: (subscription: Subscription) => void): this;

  emit(event: 'subscribed', data: Subscription): boolean;
  emit(event: 'change', change: BroadcastChange): boolean;
  emit(event: 'snapshots', data: SnapshotsData): boolean;
}

export interface SocketServer extends SocketIO.Server {
  on(event: 'connection' | 'connect', listener: (socket: Socket) => void): SocketIO.Namespace;
}

export abstract class Server extends EventEmitter {
  private errorEmitter: (error: any) => void = this.emit.bind(this, 'error');

  private subjectToDefinitionMap = new Map<string, Definition<Syncable, Subscription>>();
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

  register(subject: string, definition: Definition<Syncable, Subscription>): void {
    this.subjectToDefinitionMap.set(subject, definition);
  }

  private initChangeQueueListener(): void {
    this.on('change', change => {
      this.handleChangeFromQueue(change).catch(this.errorEmitter);
    });
  }

  private initSocketServer(): void {
    this.socketServer.on('connect', socket => {
      socket.on('subscribe', subscription => {
        let {subjectToSubscriptionInfoMap} = socket;
        let {subject} = subscription;

        let existingInfo = subjectToSubscriptionInfoMap.get(subject);

        if (existingInfo) {
          existingInfo.valid = false;
        }

        let info: SubscriptionInfo = {
          subscription,
          postponeChanges: false,
          changes: [],
          valid: true,
        };

        subjectToSubscriptionInfoMap.set(subject, info);

        socket.emit('subscribed', subscription);

        if (subscription.timestamp) {
          this.loadAndEmitChanges(socket, info).catch(this.errorEmitter);
        } else {
          this.loadAndEmitSnapshots(socket, info).catch(this.errorEmitter);
        }
      });

      socket.on('change', change => {
        this.handleChangeFromClient(change).catch(this.errorEmitter);
      });
    });
  }

  private async loadAndEmitSnapshots(socket: Socket, info: SubscriptionInfo): Promise<void> {
    info.postponeChanges = true;

    let {subscription} = info;

    let definition = this.subjectToDefinitionMap.get(subscription.subject)!;

    let snapshots = await definition.loadSnapshots(subscription);

    if (!info.valid) {
      return;
    }

    let data: SnapshotsData = Object.assign({snapshots}, subscription);

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

  private async handleChangeFromClient(change: Change): Promise<void> {
    let definition = this.subjectToDefinitionMap.get(change.subject)!;

    let lock = await this.lock(`resource-${change.resource}`, 1000);

    try {
      let timestamp = await this.generateTimestamp();
      let broadcastChange: BroadcastChange = Object.assign({timestamp}, change);

      let snapshot = await definition.mergeChange(broadcastChange);

      await this.queueChange({snapshot, ...broadcastChange});
    } finally {
      await lock.unlock();
    }
  }

  private async handleChangeFromQueue(change: BroadcastChange): Promise<void> {
    let {subject} = change;
    let socketSet = this.subjectToSocketSetMap.get(subject);

    if (!socketSet) {
      return;
    }

    let definition = this.subjectToDefinitionMap.get(subject)!;

    for (let socket of socketSet) {
      let {subjectToSubscriptionInfoMap} = socket;
      let {subscription, changes, postponeChanges} = subjectToSubscriptionInfoMap.get(subject)!;

      if (!definition.hasSubscribedChange(change, subscription)) {
        continue;
      }

      if (postponeChanges) {
        changes.push(change);
        continue;
      }

      socket.emit('change', change);
    }
  }
}

export interface Server {
  on(event: 'change', listener: (change: BroadcastChange) => void): this;
  on(event: 'error', listener: (error: any) => void): this;

  emit(event: 'change', change: BroadcastChange): boolean;
  emit(event: 'error', error: any): boolean;
}
