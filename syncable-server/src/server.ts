import { EventEmitter } from 'events';

import * as uuid from 'uuid';

import {
  BroadcastChange,
  BroadcastCreation,
  BroadcastRemoval,
  Change,
  Removal,
  Request,
  ServerCreation,
  SnapshotsData,
  Subscription,
  Syncable,
} from 'syncable';

import { SyncableDefinition } from './definition';
import { ObjectQueue } from './object-queue';

export interface ResourceLock {
  release(): PromiseLike<void>;
}

export type Visibility = boolean | 'upon-request';

export interface SubscriptionInfo {
  subscription: Subscription;
  changeEmitter: ObjectQueue<BroadcastChange>;
  visibleSet: Set<string>;
  valid: boolean;
}

export interface Socket extends SocketIO.Socket {
  subjectToSubscriptionInfoMap: Map<string, SubscriptionInfo>;

  on(event: 'change', listener: (change: Change) => void): this;
  on(event: 'subscribe', listener: (subscription: Subscription) => void): this;
  on(event: 'request', listener: (request: Request) => void): this;
  on(event: 'close', listener: () => void): this;

  emit(event: 'subscribed', data: Subscription): boolean;
  emit(event: 'change', change: BroadcastChange): boolean;
  emit(event: 'snapshots', data: SnapshotsData): boolean;
}

export interface SocketServer extends SocketIO.Server {
  on(event: 'connection' | 'connect', listener: (socket: Socket) => void): SocketIO.Namespace;
}

export class ChangeEmitter extends ObjectQueue<BroadcastChange> {
  constructor(
    private socket: Socket,
  ) {
    super();
  }

  protected emit(object: BroadcastChange): void {
    this.socket.emit('change', object);
  }

  protected resolveChannel({subject}: BroadcastChange): string {
    return subject;
  }
}

export abstract class Server<TSession> extends EventEmitter {
  private errorEmitter: (error: any) => void = this.emit.bind(this, 'error');

  private subjectToDefinitionMap = new Map<string, SyncableDefinition<Syncable, Subscription, TSession, this>>();
  private subjectToSocketSetMap = new Map<string, Set<Socket>>();

  constructor(
    private socketServer: SocketServer,
  ) {
    super();

    this.initChangeQueueListener();
    this.initSocketServer();
  }

  register(subject: string, definition: SyncableDefinition<Syncable, Subscription, TSession, this>): void {
    definition._server = this;
    this.subjectToDefinitionMap.set(subject, definition);
  }

  async spawnChange<T extends Change | ServerCreation>(change: T, session: TSession): Promise<void>;
  async spawnChange(change: Change | ServerCreation, session: TSession): Promise<void> {
    let {subject, type, resource} = change;

    let definition = this.subjectToDefinitionMap.get(subject)!;

    let lock: ResourceLock | undefined;

    if (resource) {
      lock = await this.lock(`resource-${resource}`, 1000);
    }

    try {
      let timestamp = await this.generateTimestamp();
      let snapshot: Syncable | undefined;
      let broadcastChange: BroadcastChange;

      if (type === 'create') {
        snapshot = await definition.create(change as ServerCreation, timestamp, session);
        broadcastChange = {...change as ServerCreation, resource: snapshot.uid, snapshot, timestamp};
      } else if (type === 'remove') {
        await definition.remove(change as Removal, timestamp, session);
        broadcastChange = {...change as Removal, timestamp};
      } else {
        snapshot = await definition.update(change as Change, timestamp, session);
        broadcastChange = {...change as Change, snapshot, timestamp};
      }

      await this.queueChange(broadcastChange, session);
    } finally {
      if (lock) {
        await lock.release();
      }
    }
  }

  protected abstract getSession(socket: Socket): TSession;

  protected abstract async lock(resource: string, ttl: number): Promise<ResourceLock>;
  protected abstract async generateTimestamp(): Promise<number>;

  protected abstract async queueChange(change: BroadcastChange, session: TSession): Promise<void>;

  private initChangeQueueListener(): void {
    this.on('change', ({change, session}) => {
      try {
        this.handleChangeFromQueue(change, session);
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
        let {subject, loaded} = subscription;

        let existingInfo = subjectToSubscriptionInfoMap.get(subject);

        if (existingInfo) {
          existingInfo.valid = false;
        }

        let info: SubscriptionInfo = {
          subscription,
          changeEmitter: new ChangeEmitter(socket),
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

        this.initSubscription(info, socket).catch(this.errorEmitter);
      });

      socket.on('request', request => {
        this.loadAndEmitUponRequest(request, socket).catch(this.errorEmitter);
      });

      socket.on('change', change => {
        let user = this.getSession(socket);
        this.spawnChange(change, user).catch(this.errorEmitter);
      });

      socket.on('close', () => {
        for (let subject of socket.subjectToSubscriptionInfoMap.keys()) {
          this.subjectToSocketSetMap.get(subject)!.delete(socket);
        }
      });
    });
  }

  private async initSubscription(info: SubscriptionInfo, socket: Socket): Promise<void> {
    let {subscription: {timestamp}} = info;

    if (typeof timestamp === 'number') {
      await this.loadAndEmitChanges(info, socket);
    } else {
      await this.loadAndEmitSnapshots(info, socket);
    }
  }

  private async loadAndEmitSnapshots(info: SubscriptionInfo, socket: Socket): Promise<void> {
    let {changeEmitter, subscription, visibleSet} = info;
    let {subject} = subscription;

    changeEmitter.pause(subject);

    let definition = this.subjectToDefinitionMap.get(subject)!;

    let snapshotsTimestamp = await this.generateTimestamp();

    let snapshots = await definition.loadSnapshots(subscription, socket);

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

    changeEmitter.resume(subject, ({resource, timestamp}) => {
      let resourceTimestamp = resourceToTimestampMap.get(resource);
      return !resourceTimestamp || resourceTimestamp < timestamp;
    });
  }

  private async loadAndEmitUponRequest(request: Request, socket: Socket): Promise<void> {
    let {subject, resources} = request;
    let {subjectToSubscriptionInfoMap} = socket;

    let {changeEmitter, visibleSet, subscription} = subjectToSubscriptionInfoMap.get(subject)!;

    resources = resources.filter(resource => !visibleSet.has(resource));

    if (!resources.length) {
      return;
    }

    changeEmitter.pause(subject);

    let definition = this.subjectToDefinitionMap.get(subject)!;

    let snapshots = await definition.loadSnapshotsUponRequest(resources, subscription, socket);

    for (let snapshot of snapshots) {
      let {uid: resource, timestamp} = snapshot;

      let creation: BroadcastCreation = {
        uid: uuid(),
        subject,
        resource,
        type: 'create',
        snapshot,
        timestamp,
      };

      socket.emit('change', creation);

      visibleSet.add(resource);
    }

    changeEmitter.resume(subject);
  }

  private async loadAndEmitChanges(info: SubscriptionInfo, socket: Socket): Promise<void> {
    let {changeEmitter, subscription} = info;
    let {subject} = subscription;

    changeEmitter.pause(subject);

    let definition = this.subjectToDefinitionMap.get(subject)!;

    let changes = await definition.loadChanges(subscription, socket);

    if (!info.valid) {
      return;
    }

    for (let change of changes) {
      socket.emit('change', change);
    }

    let latestTimestamp = changes.length ? changes[changes.length - 1].timestamp : 0;

    changeEmitter.resume(subject, ({timestamp}) => timestamp > latestTimestamp);
  }

  private handleChangeFromQueue(change: BroadcastChange, session: TSession): void {
    let {subject, resource, type, snapshot} = change;

    let socketSet = this.subjectToSocketSetMap.get(subject);

    if (!socketSet) {
      return;
    }

    let definition = this.subjectToDefinitionMap.get(subject)!;

    for (let socket of socketSet) {
      let {subjectToSubscriptionInfoMap} = socket;
      let {subscription, changeEmitter, visibleSet} = subjectToSubscriptionInfoMap.get(subject)!;

      if (!definition.onChange(change, session, subscription, socket)) {
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
        if (definition.testVisibility(snapshot!, subscription, socket)) {
          visibleSet.add(resource);
          changeToBroadcast = pruneAsBroadcastCreation(change);
        } else {
          continue;
        }
      } else {
        let visibility = definition.testVisibility(snapshot!, subscription, socket);

        if (visibility) {
          if (visibleSet.has(resource)) {
            let {snapshot: _, ...changeWithoutSnapshot} = change;
            changeToBroadcast = changeWithoutSnapshot;
          } else if (visibility === true) {
            visibleSet.add(resource);
            changeToBroadcast = pruneAsBroadcastCreation(change);
          } else {
            continue;
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

      changeEmitter.add(changeToBroadcast);
    }
  }
}

export interface BroadcastChangeData<TSession> {
  change: BroadcastChange;
  session: TSession;
}

export interface Server<TSession> {
  on(event: 'change', listener: (data: BroadcastChangeData<TSession>) => void): this;
  on(event: 'error', listener: (error: any) => void): this;

  emit(event: 'change', data: BroadcastChangeData<TSession>): boolean;
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
