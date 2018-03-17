import ExtendableError from 'extendable-error';
import * as isEqual from 'lodash.isequal';
import {ObservableMap, observable} from 'mobx';
import * as uuid from 'uuid';

import {
  BroadcastChange,
  BroadcastCreation,
  BroadcastRemoval,
  Change,
  ClientBroadcastChangeData,
  ClientCreation,
  RawChange,
  RawCreation,
  RawRemoval,
  Removal,
  Request,
  ServerCreation,
  SnapshotsData,
  Subscription,
  Syncable,
} from 'syncable';

import {SyncableDefinition} from './definition';

export class ChangeRejection extends ExtendableError {}

export interface Socket<TClientSession> extends SocketIOClient.Socket {
  on(event: 'reconnect', listener: (attempt: number) => void): this;
  on(event: 'subscribed', listener: (subscription: Subscription) => void): this;
  on(
    event: 'change',
    listener: (
      change: ClientBroadcastChangeData<BroadcastChange, TClientSession>,
    ) => void,
  ): this;
  on(event: 'snapshots', listener: (data: SnapshotsData) => void): this;

  emit(event: 'subscribe', subscription: Subscription): this;
  emit(event: 'change', change: Change | ServerCreation): this;
  emit(event: 'request', request: Request): this;
}

interface SyncableResourceData<T extends Syncable> {
  snapshot: T;
  changes: Change[];
}

interface SyncableSubjectData<T extends Syncable, TClientSession> {
  timestamp: number | undefined;
  subscription: Subscription | undefined;
  subscribed: boolean | undefined;
  definition: SyncableDefinition<T, TClientSession>;
  resourceDataMap: ObservableMap<SyncableResourceData<T>>;
  resourceMap: ObservableMap<T>;
}

export interface ReadyNotification<T> {
  subject: string;
  resourceMap: Map<string, T>;
}

export interface ChangeNotification<T> {
  subject: string;
  resource: string;
  object: T | undefined;
  before: T | undefined;
}

export interface CreateResult<T, U> {
  object: T;
  promise: Promise<U>;
}

export interface UpdateResult<T> {
  object: T | undefined;
  promise: Promise<T | undefined>;
}

export interface RemoveResult {
  object: undefined;
  promise: Promise<void>;
}

type SyncingChangeHandlers = [
  (object?: Syncable) => void,
  (error: any) => void
];

export class Client<TClientSession> {
  @observable syncing = false;

  private socket: Socket<TClientSession>;

  private readonly syncableSubjectDataMap = new ObservableMap<
    SyncableSubjectData<Syncable, TClientSession>
  >();

  private subjectToPendingRequestResourceSetMap:
    | Map<string, Set<string>>
    | undefined;

  private uidToSyncingChangeHandlersMap = new Map<
    string,
    SyncingChangeHandlers
  >();

  constructor(socket: SocketIOClient.Socket, public session: TClientSession) {
    this.socket = socket as Socket<TClientSession>;
  }

  register<T extends Syncable>(
    subject: string,
    definition: SyncableDefinition<T, TClientSession>,
  ): void {
    this.syncableSubjectDataMap.set(subject, {
      timestamp: undefined,
      subscription: undefined,
      subscribed: undefined,
      definition,
      resourceMap: new ObservableMap<Syncable>(),
      resourceDataMap: new ObservableMap<SyncableResourceData<Syncable>>(),
    });
  }

  init(): void {
    this.socket.on('reconnect', () => {
      this.subscribe();
    });

    this.socket.on('subscribed', ({uid, subject}) => {
      let subjectData = this.syncableSubjectDataMap.get(subject)!;

      let {subscription} = subjectData;

      if (subscription!.uid === uid) {
        subjectData.subscribed = true;
      }
    });

    this.socket.on('change', ({change, session}) => {
      let subjectData = this.syncableSubjectDataMap.get(change.subject)!;

      if (!subjectData.subscribed) {
        return;
      }

      switch (change.type) {
        case 'create':
          this.createByBroadcast(change as BroadcastCreation);
          break;
        case 'remove':
          this.removeByBroadcast(change as BroadcastRemoval);
          break;
        default:
          this.updateByBroadcast(change, session!);
          break;
      }

      subjectData.timestamp = change.timestamp;
    });

    this.socket.on('snapshots', ({subject, snapshots, timestamp}) => {
      let subjectData = this.syncableSubjectDataMap.get(subject)!;
      let {subscribed, resourceDataMap, resourceMap} = subjectData;

      if (!subscribed) {
        return;
      }

      // Only one snapshots event hit for a specified subject is expected.

      for (let snapshot of snapshots) {
        let resourceData: SyncableResourceData<Syncable> = {
          snapshot,
          changes: [],
        };

        let {uid} = snapshot;

        resourceDataMap.set(uid, resourceData);
        resourceMap.set(uid, snapshot);
      }

      subjectData.timestamp = timestamp;
    });

    this.subscribe();
  }

  subscribe(): void {
    for (let [
      subject,
      {timestamp, definition, resourceMap, resourceDataMap},
    ] of this.syncableSubjectDataMap.entries()) {
      let subscription: Subscription = {
        uid: uuid(),
        subject,
        timestamp,
        loaded:
          typeof timestamp === 'number'
            ? Array.from(resourceMap.keys())
            : undefined,
        ...definition.generateSubscription(),
      };

      let subjectData: SyncableSubjectData<Syncable, TClientSession> = {
        timestamp,
        subscription,
        subscribed: false,
        definition,
        resourceMap,
        resourceDataMap,
      };

      this.syncableSubjectDataMap.set(subject, subjectData);

      this.socket.emit('subscribe', subscription);
    }
  }

  getResourceMap<T extends Syncable>(subject: string): ObservableMap<T> {
    return (this.syncableSubjectDataMap.get(subject)!
      .resourceMap as ObservableMap<any>) as ObservableMap<T>;
  }

  request(subject: string, resources: string[]): void {
    if (!this.subjectToPendingRequestResourceSetMap) {
      this.subjectToPendingRequestResourceSetMap = new Map<
        string,
        Set<string>
      >();
      this.scheduleRequest();
    }

    let map = this.subjectToPendingRequestResourceSetMap;
    let set = map.get(subject);

    if (!set) {
      set = new Set<string>();
      map.set(subject, set);
    }

    for (let resource of resources) {
      set.add(resource);
    }
  }

  create(
    rawCreation: RawCreation,
    serverCreation = false,
  ): CreateResult<Syncable | undefined, Syncable> {
    if (serverCreation) {
      let serverChange: ServerCreation = {
        uid: uuid(),
        type: 'create',
        ...rawCreation,
      };

      return {
        object: undefined,
        promise: this.syncChange(serverChange) as Promise<Syncable>,
      };
    }

    let resource = uuid();

    let change: ClientCreation = {
      uid: uuid(),
      resource,
      type: 'create',
      ...rawCreation,
    };

    let {subject} = change;
    let {
      definition,
      resourceDataMap,
      resourceMap,
    } = this.syncableSubjectDataMap.get(subject)!;

    definition.preprocessChange(change);

    let snapshot = definition.create(change, this.session);

    let object: Syncable = {
      ...snapshot,
      syncing: true,
    };

    if (!definition.testVisibility(object)) {
      throw new Error(
        `The object created is not visible at creation: ${JSON.stringify(
          object,
        )}`,
      );
    }

    let resourceData: SyncableResourceData<Syncable> = {
      snapshot,
      changes: [change],
    };

    resourceDataMap.set(resource, resourceData);
    resourceMap.set(resource, object);

    return {
      object,
      promise: this.syncChange(change) as Promise<Syncable>,
    };
  }

  update(rawChange: RawChange): UpdateResult<Syncable> {
    let change: Change = {
      uid: uuid(),
      ...rawChange,
    };

    let {subject, resource} = change;
    let {
      definition,
      resourceDataMap,
      resourceMap,
    } = this.syncableSubjectDataMap.get(subject)!;

    definition.preprocessChange(change);

    let {changes} = resourceDataMap.get(resource)!;

    let objectBeforeChange = resourceMap.get(resource)!;

    let {syncing: _, ...objectBeforeChangeWithoutSyncing} = objectBeforeChange;

    let object: Syncable | undefined = definition.update(
      objectBeforeChangeWithoutSyncing,
      change,
      this.session,
    );

    if (isEqual(object, objectBeforeChangeWithoutSyncing)) {
      return {
        object,
        promise: Promise.resolve(object),
      };
    }

    object = {
      ...object,
      syncing: true,
    };

    if (definition.testVisibility(object)) {
      resourceMap.set(resource, object);
    } else {
      object = undefined;
      resourceMap.delete(resource);
    }

    changes.push(change);

    return {
      object,
      promise: this.syncChange(change),
    };
  }

  remove(rawRemoval: RawRemoval): RemoveResult {
    let change: Removal = {
      uid: uuid(),
      type: 'remove',
      ...rawRemoval,
    };

    let {subject, resource} = change;
    let {
      definition,
      resourceDataMap,
      resourceMap,
    } = this.syncableSubjectDataMap.get(subject)!;

    definition.preprocessChange(change);

    let {changes} = resourceDataMap.get(resource)!;
    let object = resourceMap.get(resource)!;

    if (!object) {
      return {
        object,
        promise: Promise.resolve(object),
      };
    }

    resourceMap.delete(resource);

    changes.push(change);

    return {
      object: undefined,
      promise: this.syncChange(change) as Promise<void>,
    };
  }

  private createByBroadcast(creation: BroadcastCreation): void {
    let {uid, subject, resource, snapshot: object} = creation;

    let {
      definition,
      resourceDataMap,
      resourceMap,
    } = this.syncableSubjectDataMap.get(subject)!;

    let resourceData = resourceDataMap.get(resource);
    let objectBeforeChange = resourceMap.get(resource);

    if (resourceData && objectBeforeChange) {
      resourceData.snapshot = object;

      let changes = resourceData.changes;

      this.shiftChanges(changes, uid);

      for (let change of changes) {
        object = definition.update(object, change, this.session);
      }
    } else {
      resourceData = {
        snapshot: object,
        changes: [],
      };

      resourceDataMap.set(resource, resourceData);
    }

    resourceMap.set(resource, object);

    this.fulfillChange(uid, object);
  }

  private updateByBroadcast(
    change: BroadcastChange,
    session: TClientSession,
  ): void {
    let {uid, subject, resource, timestamp} = change;
    let {
      definition,
      resourceDataMap,
      resourceMap,
    } = this.syncableSubjectDataMap.get(subject)!;

    let resourceData = resourceDataMap.get(resource)!;
    let {snapshot, changes} = resourceData;

    this.shiftChanges(changes, uid);

    let object = definition.update(snapshot, change, session);

    object = {...object, timestamp};

    resourceData.snapshot = object;

    for (let change of changes) {
      object = definition.update(object, change, this.session);
    }

    resourceMap.set(resource, object);

    this.fulfillChange(uid, object);
  }

  private removeByBroadcast(removal: BroadcastRemoval): void {
    let {uid, subject, resource} = removal;

    let subjectData = this.syncableSubjectDataMap.get(subject)!;

    let {resourceDataMap, resourceMap} = subjectData;

    let object = resourceMap.get(resource)!;

    resourceDataMap.delete(resource);

    if (object) {
      resourceMap.delete(resource);
    }

    this.fulfillChange(uid, undefined);
  }

  private async syncChange(
    change: Change | ServerCreation,
  ): Promise<Syncable | undefined> {
    let uid = change.uid;

    return new Promise<Syncable>((resolve, reject) => {
      this.uidToSyncingChangeHandlersMap.set(uid, [resolve, reject]);
      this.syncing = true;
      this.socket.emit('change', change);
    });
  }

  private scheduleRequest(): void {
    setTimeout(() => {
      let map = this.subjectToPendingRequestResourceSetMap;

      if (!map) {
        return;
      }

      this.subjectToPendingRequestResourceSetMap = undefined;

      for (let [subject, set] of map) {
        this.socket.emit('request', {
          subject,
          resources: Array.from(set),
        });
      }
    }, 100);
  }

  private shiftChanges(changes: Change[], uid: string): void {
    let index = changes.findIndex(change => change.uid === uid);
    let shifted = changes.splice(0, index + 1);
    let discarded = shifted.slice(0, shifted.length - 1);

    for (let {uid} of discarded) {
      let handlers = this.uidToSyncingChangeHandlersMap.get(uid);

      if (!handlers) {
        continue;
      }

      this.uidToSyncingChangeHandlersMap.delete(uid);

      if (this.uidToSyncingChangeHandlersMap.size === 0) {
        this.syncing = false;
      }

      handlers[1](new ChangeRejection());
    }
  }

  private fulfillChange(uid: string, object: Syncable | undefined): void {
    let handlers = this.uidToSyncingChangeHandlersMap.get(uid);

    if (!handlers) {
      return;
    }

    this.uidToSyncingChangeHandlersMap.delete(uid);

    if (this.uidToSyncingChangeHandlersMap.size === 0) {
      this.syncing = false;
    }

    handlers[0](object);
  }
}
