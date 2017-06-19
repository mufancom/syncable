import * as uuid from 'uuid';

import {
  BroadcastChange,
  BroadcastCreation,
  Change,
  Creation,
  GeneralSubscription,
  RawChange,
  SnapshotsData,
  Subscription,
  Syncable,
} from 'syncable';

import {Definition} from './definition';

export interface Socket extends SocketIOClient.Socket {
  on(event: 'subscribed', listener: (subscription: Subscription) => void): this;
  on(event: 'change', listener: (change: BroadcastChange) => void): this;
  on(event: 'snapshots', listener: (data: SnapshotsData) => void): this;

  emit(event: 'change', change: Change): this;
  emit(event: 'subscribe', subscription: Subscription): this;
}

export interface ResourceData<T extends Syncable> {
  object: T;
  snapshot: T;
  changes: Change[];
}

export interface SubjectData<T extends Syncable> {
  timestamp: number;
  subscription: Subscription;
  subscribed: boolean;
  resourceDataMap: Map<string, ResourceData<T>>;
}

export interface RawCreation {
  subject: string;
  resource: string;
}

export class Client {
  private subjectToDefinitionMap = new Map<string, Definition<Syncable>>();

  private subjectDataMap = new Map<string, SubjectData<Syncable>>();

  constructor(
    private socket: Socket,
  ) {
    this.init();
  }

  register(subject: string, definition: Definition<Syncable>): void {
    this.subjectToDefinitionMap.set(subject, definition);
  }

  subscribe(): void {
    for (let [subject, definition] of this.subjectToDefinitionMap) {
      let subjectData = this.subjectDataMap.get(subject);

      let timestamp = subjectData && subjectData.timestamp;

      let subscription: GeneralSubscription = Object.assign(
        {uid: uuid(), subject, timestamp},
        definition.generateSubscription(),
      );

      subjectData = {
        timestamp: timestamp || 0,
        subscription,
        subscribed: false,
        resourceDataMap: new Map<string, ResourceData<Syncable>>(),
      };

      this.subjectDataMap.set(subject, subjectData);

      this.socket.emit('subscribe', subscription);
    }
  }

  create(rawCreation: RawCreation): void {
    let change: Creation = Object.assign(
      // tslint:disable-next-line:no-unnecessary-type-assertion
      {uid: uuid(), type: 'create' as 'create'},
      rawCreation,
    );

    let {subject, resource} = change;

    let definition = this.subjectToDefinitionMap.get(subject)!;
    let {resourceDataMap} = this.subjectDataMap.get(subject)!;

    let object = definition.create(change);

    let resourceData: ResourceData<Syncable> = {
      object,
      snapshot: Object.assign({}, object),
      changes: [change],
    };

    resourceDataMap.set(resource, resourceData);

    this.syncChange(change);
  }

  update(rawChange: RawChange): void {
    let change: Change = Object.assign({uid: uuid()}, rawChange);

    let {subject, resource} = change;

    let definition = this.subjectToDefinitionMap.get(subject)!;
    let {resourceDataMap} = this.subjectDataMap.get(subject)!;

    let {object, changes} = resourceDataMap.get(resource)!;

    definition.update(object, change);
    changes.push(change);

    this.syncChange(change);
  }

  private createByBroadcast({
    uid,
    timestamp,
    subject,
    resource,
    snapshot: broadcastSnapshot,
  }: BroadcastCreation): void {
    let definition = this.subjectToDefinitionMap.get(subject)!;
    let subjectData = this.subjectDataMap.get(subject)!;

    let {resourceDataMap} = subjectData;

    let resourceData = resourceDataMap.get(resource);

    if (resourceData) {
      let {object, snapshot, changes} = resourceData;

      shiftFirstChangeIfMatch(changes, uid);

      resetObjectToSnapshot(snapshot, broadcastSnapshot!);
      resetObjectToSnapshot(object, snapshot);

      for (let change of changes) {
        definition.update(object, change);
      }
    } else {
      let snapshot = Object.assign({}, broadcastSnapshot!);
      let object = Object.assign({}, snapshot);

      resourceData = {
        object,
        snapshot,
        changes: [],
      };

      resourceDataMap.set(resource, resourceData);
    }

    subjectData.timestamp = timestamp;
  }

  private updateByBroadcast(change: BroadcastChange): void {
    let {uid, timestamp, subject, resource} = change;
    let definition = this.subjectToDefinitionMap.get(subject)!;
    let subjectData = this.subjectDataMap.get(subject)!;

    let {resourceDataMap} = subjectData;

    let {object, snapshot, changes} = resourceDataMap.get(resource)!;

    shiftFirstChangeIfMatch(changes, uid);

    resetObjectToSnapshot(object, snapshot);

    definition.update(object, change);

    for (let change of changes) {
      definition.update(object, change);
    }

    subjectData.timestamp = timestamp;
  }

  private init(): void {
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
      let {subscribed, resourceDataMap} = subjectData;

      if (!subscribed) {
        return;
      }

      // Only one snapshots event hit for a specified subject is expected.

      for (let snapshot of snapshots) {
        let resourceData: ResourceData<Syncable> = {
          object: Object.assign({}, snapshot),
          snapshot: Object.assign({}, snapshot),
          changes: [],
        };

        resourceDataMap.set(snapshot.uid, resourceData);
        subjectData.timestamp = Math.max(subjectData.timestamp, snapshot.timestamp);
      }
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
