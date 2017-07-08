import { Subject } from 'rxjs/Subject';
import * as uuid from 'uuid';

import {
  BroadcastChange,
  BroadcastCreation,
  BroadcastRemoval,
  Change,
  Creation,
  RawChange,
  RawCreation,
  RawRemoval,
  Removal,
  SnapshotsData,
  Subscription,
  Syncable,
} from 'syncable';

import { SyncableDefinition } from './definition';

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
  timestamp: number | undefined;
  subscription: Subscription | undefined;
  subscribed: boolean | undefined;
  definition: SyncableDefinition<T>;
  resourceDataMap: Map<string, ResourceData<T>>;
  resourceMap: Map<string, T>;
}

export interface ReadyNotification<T extends Syncable> {
  subject: string;
  resourceMap: Map<string, T>;
}

export interface ChangeNotification<T extends Syncable> {
  subject: string;
  resource: string;
  object: T | undefined;
  snapshot: T | undefined;
}

export class Client {
  readonly ready = new Subject<ReadyNotification<Syncable>>();
  readonly change = new Subject<ChangeNotification<Syncable>>();

  private socket: Socket;
  private subjectDataMap = new Map<string, SubjectData<Syncable>>();

  constructor(socket: SocketIOClient.Socket) {
    this.socket = socket as Socket;
  }

  register<T extends Syncable>(subject: string, definition: SyncableDefinition<T>): void {
    let resourceMap = new Map<string, T>();
    let resourceDataMap = new Map<string, ResourceData<T>>();

    let subjectData: SubjectData<T> = {
      timestamp: undefined,
      subscription: undefined,
      subscribed: undefined,
      definition,
      resourceMap,
      resourceDataMap,
    };

    this.subjectDataMap.set(subject, subjectData);
  }

  init(): void {
    this.socket.on('reconnect', () => {
      this.subscribe();
    });

    this.socket.on('subscribed', ({uid, subject}) => {
      let subjectData = this.subjectDataMap.get(subject)!;

      let {subscription} = subjectData;

      if (subscription!.uid === uid) {
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
        case 'remove':
          this.removeByBroadcast(change as BroadcastRemoval);
          break;
        default:
          this.updateByBroadcast(change);
          break;
      }

      subjectData.timestamp = change.timestamp;
    });

    this.socket.on('snapshots', ({subject, snapshots, timestamp}) => {
      let subjectData = this.subjectDataMap.get(subject)!;
      let {subscribed, resourceDataMap, resourceMap} = subjectData;

      if (!subscribed) {
        return;
      }

      // Only one snapshots event hit for a specified subject is expected.

      for (let snapshot of snapshots) {
        let resourceData: ResourceData<Syncable> = {
          snapshot,
          changes: [],
        };

        let {uid} = snapshot;

        resourceDataMap.set(uid, resourceData);
        resourceMap.set(uid, snapshot);
      }

      subjectData.timestamp = timestamp;

      this.ready.next({subject, resourceMap});
    });

    this.subscribe();
  }

  subscribe(): void {
    for (
      let [
        subject,
        {timestamp, definition, resourceMap, resourceDataMap},
      ] of this.subjectDataMap
    ) {
      let subscription: Subscription = {
        uid: uuid(),
        subject,
        timestamp,
        loaded: typeof timestamp === 'number' ?
          Array.from(resourceMap.keys()) : undefined,
        ...definition.generateSubscription(),
      };

      let subjectData: SubjectData<Syncable> = {
        timestamp,
        subscription,
        subscribed: false,
        definition,
        resourceMap,
        resourceDataMap,
      };

      this.subjectDataMap.set(subject, subjectData);

      this.socket.emit('subscribe', subscription);
    }
  }

  getResourceMap<T extends Syncable>(subject: string): Map<string, T> {
    return this.subjectDataMap.get(subject)!.resourceMap as Map<string, T>;
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
    let {definition, resourceDataMap, resourceMap} = this.subjectDataMap.get(subject)!;

    definition.preprocessChange(change);

    let object = definition.create(change);

    if (!definition.testVisibility(object)) {
      throw new Error(`The object created is not visible at creation: ${JSON.stringify(object)}`);
    }

    let resourceData: ResourceData<Syncable> = {
      snapshot: object,
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
    let {definition, resourceDataMap, resourceMap} = this.subjectDataMap.get(subject)!;

    definition.preprocessChange(change);

    let {changes} = resourceDataMap.get(resource)!;
    let object: Syncable | undefined = resourceMap.get(resource)!;

    let snapshotBeforeChange = object;

    object = definition.update(object, change);

    if (definition.testVisibility(object)) {
      resourceMap.set(resource, object);
    } else {
      object = undefined;
      resourceMap.delete(resource);
    }

    changes.push(change);

    this.change.next({
      subject,
      resource,
      snapshot: snapshotBeforeChange,
      object,
    });

    this.syncChange(change);
  }

  remove(rawRemoval: RawRemoval): void {
    let change: Removal = Object.assign(
      {
        uid: uuid(),
        // tslint:disable-next-line:no-unnecessary-type-assertion
        type: 'remove' as 'remove',
      },
      rawRemoval,
    );

    let {subject, resource} = change;
    let {definition, resourceDataMap, resourceMap} = this.subjectDataMap.get(subject)!;

    definition.preprocessChange(change);

    let {changes} = resourceDataMap.get(resource)!;
    let object = resourceMap.get(resource)!;

    resourceMap.delete(resource);

    changes.push(change);

    this.change.next({
      subject,
      resource,
      snapshot: object,
      object: undefined,
    });

    this.syncChange(change);
  }

  private createByBroadcast(creation: BroadcastCreation): void {
    let {
      uid,
      subject,
      resource,
      snapshot: broadcastSnapshot,
    } = creation;

    let {definition, resourceDataMap, resourceMap} = this.subjectDataMap.get(subject)!;

    let resourceData = resourceDataMap.get(resource);
    let object = resourceMap.get(resource);

    let snapshotBeforeChange: Syncable | undefined;

    if (resourceData && object) {
      snapshotBeforeChange = object;

      let {changes} = resourceData;

      shiftFirstChangeIfMatch(changes, uid);

      object = broadcastSnapshot;

      resourceData.snapshot = object;

      for (let change of changes) {
        object = definition.update(object, change);
      }

      resourceMap.set(resource, object);
    } else {
      let snapshot = broadcastSnapshot;

      object = snapshot;

      resourceData = {
        snapshot,
        changes: [],
      };

      resourceDataMap.set(resource, resourceData);
      resourceMap.set(resource, object);
    }

    this.change.next({
      subject,
      resource,
      snapshot: snapshotBeforeChange,
      object,
    });
  }

  private updateByBroadcast(change: BroadcastChange): void {
    let {uid, subject, resource} = change;
    let {definition, resourceDataMap, resourceMap} = this.subjectDataMap.get(subject)!;

    let object = resourceMap.get(resource)!;
    let snapshotBeforeChange = object;

    let resourceData = resourceDataMap.get(resource)!;
    let {snapshot, changes} = resourceData;

    shiftFirstChangeIfMatch(changes, uid);

    object = definition.update(snapshot, change);

    resourceData.snapshot = object;

    for (let change of changes) {
      object = definition.update(object, change);
    }

    resourceMap.set(resource, object);

    this.change.next({
      subject,
      resource,
      snapshot: snapshotBeforeChange,
      object,
    });
  }

  private removeByBroadcast(removal: BroadcastRemoval): void {
    let {subject, resource} = removal;

    let subjectData = this.subjectDataMap.get(subject)!;

    let {resourceDataMap, resourceMap} = subjectData;

    let object = resourceMap.get(resource)!;

    resourceDataMap.delete(resource);
    resourceMap.delete(resource);

    this.change.next({
      subject,
      resource,
      snapshot: object,
      object: undefined,
    });
  }

  private syncChange(change: Change): void {
    this.socket.emit('change', change);
  }
}

function shiftFirstChangeIfMatch(changes: Change[], uid: string): void {
  let change = changes[0];

  if (change && change.uid === uid) {
    changes.shift();
  }
}
