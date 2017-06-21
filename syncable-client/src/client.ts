import { Subject } from 'rxjs/Subject';
import * as uuid from 'uuid';

import {
  BroadcastChange,
  BroadcastCreation,
  Change,
  Creation,
  RawChange,
  RawCreation,
  SnapshotsData,
  Subscription,
  Syncable,
} from 'syncable';

import {SyncableDefinition} from './definition';

export interface Socket extends SocketIOClient.Socket {
  on(event: 'reconnect', listener: (attempt: number) => void): this;
  on(event: 'subscribed', listener: (subscription: Subscription) => void): this;
  on(event: 'change', listener: (change: BroadcastChange) => void): this;
  on(event: 'snapshots', listener: (data: SnapshotsData) => void): this;

  emit(event: 'change', change: Change): this;
  emit(event: 'subscribe', subscription: Subscription): this;
}

export interface ResourceData<T extends Syncable> {
  snapshot: T;
  changes: Change[];
}

export interface SubjectData<T extends Syncable> {
  timestamp: number;
  subscription: Subscription;
  subscribed: boolean;
  resourceDataMap: Map<string, ResourceData<T>>;
  resourceMap: Map<string, T>;
}

export interface ChangeNotification<T extends Syncable> {
  subject: string;
  resource: string;
  object: T;
  snapshot: T | undefined;
}

export interface SnapshotsNotification<T extends Syncable> {
  subject: string;
  resourceMap: Map<string, T>;
}

export class Client {
  readonly change = new Subject<ChangeNotification<Syncable>>();
  readonly snapshots = new Subject<SnapshotsNotification<Syncable>>();

  private socket: Socket;
  private subjectToDefinitionMap = new Map<string, SyncableDefinition<Syncable>>();
  private subjectDataMap = new Map<string, SubjectData<Syncable>>();

  constructor(socket: SocketIOClient.Socket) {
    this.socket = socket as Socket;
  }

  register(subject: string, definition: SyncableDefinition<Syncable>): void {
    this.subjectToDefinitionMap.set(subject, definition);
  }

  init(): void {
    this.socket.on('reconnect', () => {
      this.subscribe();
    });

    this.socket.on('subscribed', ({uid, subject}) => {
      let subjectData = this.subjectDataMap.get(subject)!;

      let {subscription} = subjectData;

      if (subscription.uid === uid) {
        subjectData.subscribed = true;
      }
    });

    this.socket.on('change', change => {
      let {subject} = change;

      let subjectData = this.subjectDataMap.get(subject)!;

      if (!subjectData.subscribed) {
        return;
      }

      switch (change.type) {
        case 'create':
          this.createByBroadcast(change as BroadcastCreation);
          break;
        default:
          this.updateByBroadcast(change);
          break;
      }
    });

    this.socket.on('snapshots', ({subject, snapshots}) => {
      let subjectData = this.subjectDataMap.get(subject)!;
      let {subscribed, resourceDataMap, resourceMap} = subjectData;

      if (!subscribed) {
        return;
      }

      let definition = this.subjectToDefinitionMap.get(subject)!;

      // Only one snapshots event hit for a specified subject is expected.

      for (let snapshot of snapshots) {
        let object = Object.assign({}, snapshot);

        if (definition.init) {
          definition.init(object);
        }

        let resourceData: ResourceData<Syncable> = {
          snapshot: Object.assign({}, snapshot),
          changes: [],
        };

        let {uid, timestamp} = snapshot;

        resourceDataMap.set(uid, resourceData);
        resourceMap.set(uid, object);

        subjectData.timestamp = Math.max(subjectData.timestamp, timestamp);
      }

      this.snapshots.next({subject, resourceMap});
    });

    this.subscribe();
  }

  subscribe(): void {
    for (let [subject, definition] of this.subjectToDefinitionMap) {
      let subjectData = this.subjectDataMap.get(subject);

      let timestamp: number | undefined;
      let resourceMap: Map<string, Syncable>;
      let resourceDataMap: Map<string, ResourceData<Syncable>>;

      if (subjectData) {
        timestamp = subjectData.timestamp;
        resourceMap = subjectData.resourceMap;
        resourceDataMap = subjectData.resourceDataMap;
      } else {
        resourceMap = new Map<string, Syncable>();
        resourceDataMap = new Map<string, ResourceData<Syncable>>();
      }

      let subscription: Subscription = Object.assign(
        {uid: uuid(), subject, timestamp},
        definition.generateSubscription(),
      );

      subjectData = {
        timestamp: timestamp || 0,
        subscription,
        subscribed: false,
        resourceMap,
        resourceDataMap,
      };

      this.subjectDataMap.set(subject, subjectData);

      this.socket.emit('subscribe', subscription);
    }
  }

  getResourceMap<T extends Syncable>(subject: string): Map<string, T> | undefined {
    let subjectData = this.subjectDataMap.get(subject);
    return subjectData && subjectData.resourceMap as Map<string, T>;
  }

  create(rawCreation: RawCreation): Syncable {
    let change: Creation = Object.assign(
      {
        uid: uuid(),
        resource: uuid(),
        // tslint:disable-next-line:no-unnecessary-type-assertion
        type: 'create' as 'create',
      },
      rawCreation,
    );

    let {subject, resource} = change;

    let definition = this.subjectToDefinitionMap.get(subject)!;

    definition.preprocessChange(change);

    let {resourceDataMap, resourceMap} = this.subjectDataMap.get(subject)!;

    let object = definition.create(change);

    let resourceData: ResourceData<Syncable> = {
      snapshot: Object.assign({}, object),
      changes: [change],
    };

    resourceDataMap.set(resource, resourceData);
    resourceMap.set(resource, object);

    this.change.next({
      subject,
      resource,
      snapshot: undefined,
      object,
    });

    this.syncChange(change);

    return object;
  }

  update(rawChange: RawChange): void {
    let change: Change = Object.assign({uid: uuid()}, rawChange);

    let {subject, resource} = change;

    let definition = this.subjectToDefinitionMap.get(subject)!;

    definition.preprocessChange(change);

    let {resourceDataMap, resourceMap} = this.subjectDataMap.get(subject)!;

    let {changes} = resourceDataMap.get(resource)!;
    let object = resourceMap.get(resource)!;

    let snapshotBeforeChange = Object.assign({}, object);

    definition.update(object, change);
    changes.push(change);

    this.change.next({
      subject,
      resource,
      snapshot: snapshotBeforeChange,
      object,
    });

    this.syncChange(change);
  }

  private createByBroadcast(creation: BroadcastCreation): void {
    let {
      uid,
      timestamp,
      subject,
      resource,
      snapshot: broadcastSnapshot,
    } = creation;

    let definition = this.subjectToDefinitionMap.get(subject)!;
    let subjectData = this.subjectDataMap.get(subject)!;

    let {resourceDataMap, resourceMap} = subjectData;

    let resourceData = resourceDataMap.get(resource);
    let object = resourceMap.get(resource);

    let snapshotBeforeChange: Syncable | undefined;

    if (resourceData && object) {
      snapshotBeforeChange = Object.assign({}, object);

      let {snapshot, changes} = resourceData;

      shiftFirstChangeIfMatch(changes, uid);

      resetObjectToSnapshot(snapshot, broadcastSnapshot!);
      resetObjectToSnapshot(object, snapshot);

      if (definition.init) {
        definition.init(object);
      }

      for (let change of changes) {
        definition.update(object, change);
      }
    } else {
      let snapshot = Object.assign({}, broadcastSnapshot!);

      object = Object.assign({}, snapshot);

      if (definition.init) {
        definition.init(object);
      }

      resourceData = {
        snapshot,
        changes: [],
      };

      resourceDataMap.set(resource, resourceData);
      resourceMap.set(resource, object);
    }

    subjectData.timestamp = timestamp;

    this.change.next({
      subject,
      resource,
      snapshot: snapshotBeforeChange,
      object,
    });
  }

  private updateByBroadcast(change: BroadcastChange): void {
    let {uid, timestamp, subject, resource} = change;
    let definition = this.subjectToDefinitionMap.get(subject)!;
    let subjectData = this.subjectDataMap.get(subject)!;

    let {resourceDataMap, resourceMap} = subjectData;

    let {snapshot, changes} = resourceDataMap.get(resource)!;
    let object = resourceMap.get(resource)!;
    let snapshotBeforeChange = Object.assign({}, object);

    shiftFirstChangeIfMatch(changes, uid);

    resetObjectToSnapshot(object, snapshot);

    if (definition.init) {
      definition.init(object);
    }

    definition.update(object, change);

    for (let change of changes) {
      definition.update(object, change);
    }

    subjectData.timestamp = timestamp;

    this.change.next({
      subject,
      resource,
      snapshot: snapshotBeforeChange,
      object,
    });
  }

  private syncChange(change: Change): void {
    this.socket.emit('change', change);
  }
}

function resetObjectToSnapshot(object: object, snapshot: object): void {
  for (let key of Object.keys(object)) {
    delete (object as any)[key];
  }

  Object.assign(object, snapshot);
}

function shiftFirstChangeIfMatch(changes: Change[], uid: string): void {
  let change = changes[0];

  if (change && change.uid === uid) {
    changes.shift();
  }
}
