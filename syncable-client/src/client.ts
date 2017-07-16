import * as isEqual from 'lodash.isequal';
import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import * as uuid from 'uuid';

import {
  BroadcastChange,
  BroadcastCreation,
  BroadcastRemoval,
  Change,
  ClientCreation,
  RawChange,
  RawCreation,
  RawRemoval,
  Removal,
  Request,
  SnapshotsData,
  Subscription,
  Syncable,
} from 'syncable';

import { SyncableDefinition } from './definition';

import {
  CompoundDefinition,
  CompoundEntryResolver,
  Dependency,
} from './compound-definition';

export interface Socket extends SocketIOClient.Socket {
  on(event: 'reconnect', listener: (attempt: number) => void): this;
  on(event: 'subscribed', listener: (subscription: Subscription) => void): this;
  on(event: 'change', listener: (change: BroadcastChange) => void): this;
  on(event: 'snapshots', listener: (data: SnapshotsData) => void): this;

  emit(event: 'subscribe', subscription: Subscription): this;
  emit(event: 'change', change: Change): this;
  emit(event: 'request', request: Request): this;
}

interface SyncableResourceData<T extends Syncable> {
  snapshot: T;
  changes: Change[];
}

interface SyncableSubjectData<T extends Syncable> {
  timestamp: number | undefined;
  subscription: Subscription | undefined;
  subscribed: boolean | undefined;
  definition: SyncableDefinition<T>;
  resourceDataMap: Map<string, SyncableResourceData<T>>;
  resourceMap: Map<string, T>;
}

export interface DependencyData<T extends Syncable, TEntry extends Syncable> {
  indexToResourceSetMapMap: Map<string, Map<any, Set<T>>>;
  resourceMap: Map<string, T>;
  compoundEntryResolver: CompoundEntryResolver<T, TEntry>;
}

interface CompoundSubjectData<T> {
  definition: CompoundDefinition<T, Syncable>;
  resourceMap: Map<string, T>;
  pendingDependencySet: Set<string>;
  dependencyDataMap: Map<string, DependencyData<Syncable, Syncable>>;
  dependencyHost: CompoundDependencyHost;
}

export interface ReadyNotification<T> {
  subject: string;
  resourceMap: Map<string, T>;
}

export interface ChangeNotification<T> {
  subject: string;
  resource: string;
  object: T | undefined;
  snapshot: T | undefined;
}

export class CompoundDependencyHost {
  constructor(
    private dependencyDataMap: Map<string, DependencyData<Syncable, Syncable>>,
  ) { }

  getDependencyResource<TDependency extends Syncable>(subject: string, uid: string): TDependency | undefined {
    let {resourceMap} = this.dependencyDataMap.get(subject)!;
    return resourceMap.get(uid) as TDependency;
  }

  getDependencyResourceByIndex<TDependency extends Syncable, TKey extends keyof TDependency = keyof TDependency>(
    subject: string,
    key: TKey,
    index: TDependency[TKey],
  ): TDependency | undefined {
    return this.getDependencyResourcesByIndex<TDependency, TKey>(subject, key, index)[0];
  }

  getDependencyResourcesByIndex<TDependency extends Syncable, TKey extends keyof TDependency = keyof TDependency>(
    subject: string,
    key: TKey,
    index: TDependency[TKey],
  ): TDependency[] {
    let {indexToResourceSetMapMap} =
      this.dependencyDataMap.get(subject)! as DependencyData<TDependency, Syncable>;

    let indexToResourceSetMap = indexToResourceSetMapMap.get(key);
    let resourceSet = indexToResourceSetMap && indexToResourceSetMap.get(index);

    return resourceSet ?
      Array
        .from(resourceSet.values())
        .sort((a, b) => a.timestamp - b.timestamp) :
      [];
  }
}

export class Client {
  readonly ready = new Subject<ReadyNotification<Syncable>>();
  readonly change = new Subject<ChangeNotification<Syncable>>();

  private socket: Socket;
  private syncableSubjectDataMap = new Map<string, SyncableSubjectData<Syncable>>();
  private compoundSubjectDataMap = new Map<string, CompoundSubjectData<any>>();
  private syncableSubjectToCompoundSubjectSetMap = new Map<string, Set<string>>();

  constructor(socket: SocketIOClient.Socket) {
    this.socket = socket as Socket;
  }

  register<T extends Syncable>(subject: string, definition: SyncableDefinition<T>): void {
    let subjectData: SyncableSubjectData<T> = {
      timestamp: undefined,
      subscription: undefined,
      subscribed: undefined,
      definition,
      resourceMap: new Map<string, T>(),
      resourceDataMap: new Map<string, SyncableResourceData<T>>(),
    };

    this.syncableSubjectDataMap.set(subject, subjectData);
  }

  registerCompound<T, TEntry extends Syncable>(subject: string, definition: CompoundDefinition<T, TEntry>): void {
    let {compoundSubjectDataMap, syncableSubjectToCompoundSubjectSetMap} = this;
    let {dependencies} = definition;

    let dependencyDataMap = new Map<string, DependencyData<Syncable, TEntry>>();

    for (
      let {
        subject: syncableSubject,
        options: {
          indexes = [],
          compoundEntryResolver,
        },
      } of dependencies
    ) {
      let indexToResourceSetMapMap = new Map(
        indexes.map<[string, Map<any, Set<Syncable>>]>(key => [
          key,
          new Map<any, Set<Syncable>>(),
        ]),
      );

      dependencyDataMap.set(syncableSubject, {
        indexToResourceSetMapMap,
        compoundEntryResolver,
        resourceMap: this.getResourceMap(syncableSubject),
      });

      let set = syncableSubjectToCompoundSubjectSetMap.get(syncableSubject);

      if (set) {
        set.add(subject);
      } else {
        set = new Set([subject]);
        syncableSubjectToCompoundSubjectSetMap.set(syncableSubject, set);
      }
    }

    let subjectData: CompoundSubjectData<T> = {
      definition,
      resourceMap: new Map<string, T>(),
      pendingDependencySet: new Set(dependencies.map(({subject}) => subject)),
      dependencyDataMap,
      dependencyHost: new CompoundDependencyHost(dependencyDataMap),
    };

    compoundSubjectDataMap.set(subject, subjectData);
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

    this.socket.on('change', change => {
      let {subject} = change;

      let subjectData = this.syncableSubjectDataMap.get(subject)!;

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

      this.onSyncableReady({subject, resourceMap});
    });

    this.subscribe();
  }

  subscribe(): void {
    for (
      let [
        subject,
        {timestamp, definition, resourceMap, resourceDataMap},
      ] of this.syncableSubjectDataMap
    ) {
      let subscription: Subscription = {
        uid: uuid(),
        subject,
        timestamp,
        loaded: typeof timestamp === 'number' ?
          Array.from(resourceMap.keys()) : undefined,
        ...definition.generateSubscription(),
      };

      let subjectData: SyncableSubjectData<Syncable> = {
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

  getResourceMap<T extends Syncable>(subject: string): Map<string, T> {
    return this.syncableSubjectDataMap.get(subject)!.resourceMap as Map<string, T>;
  }

  getCompoundResourceMap<T>(subject: string): Map<string, T> {
    return this.compoundSubjectDataMap.get(subject)!.resourceMap as Map<string, T>;
  }

  getReadyObservable<T extends Syncable>(subject: string): Observable<ReadyNotification<T>> {
    return this.ready.filter(notification => notification.subject === subject);
  }

  getChangeObservable<T extends Syncable>(subject: string): Observable<ChangeNotification<T>> {
    return this.change.filter(notification => notification.subject === subject);
  }

  request(subject: string, resources: string[]): void {
    let request: Request = {
      subject,
      resources,
    };

    this.socket.emit('request', request);
  }

  create(rawCreation: RawCreation): Syncable {
    let resource = uuid();

    let change: ClientCreation = Object.assign(
      {
        uid: uuid(),
        resource,
        // tslint:disable-next-line:no-unnecessary-type-assertion
        type: 'create' as 'create',
      },
      rawCreation,
    );

    let {subject} = change;
    let {definition, resourceDataMap, resourceMap} = this.syncableSubjectDataMap.get(subject)!;

    definition.preprocessChange(change);

    let object = definition.create(change);

    if (!definition.testVisibility(object)) {
      throw new Error(`The object created is not visible at creation: ${JSON.stringify(object)}`);
    }

    let resourceData: SyncableResourceData<Syncable> = {
      snapshot: object,
      changes: [change],
    };

    resourceDataMap.set(resource, resourceData);
    resourceMap.set(resource, object);

    this.onSyncableChange({
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
    let {definition, resourceDataMap, resourceMap} = this.syncableSubjectDataMap.get(subject)!;

    definition.preprocessChange(change);

    let {changes} = resourceDataMap.get(resource)!;
    let object: Syncable | undefined = resourceMap.get(resource)!;

    let snapshotBeforeChange = object;

    object = definition.update(object, change);

    if (isEqual(object, snapshotBeforeChange)) {
      return;
    }

    if (definition.testVisibility(object)) {
      resourceMap.set(resource, object);
    } else {
      object = undefined;
      resourceMap.delete(resource);
    }

    changes.push(change);

    this.onSyncableChange({
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
    let {definition, resourceDataMap, resourceMap} = this.syncableSubjectDataMap.get(subject)!;

    definition.preprocessChange(change);

    let {changes} = resourceDataMap.get(resource)!;
    let object = resourceMap.get(resource)!;

    if (!object) {
      return;
    }

    resourceMap.delete(resource);

    changes.push(change);

    this.onSyncableChange({
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

    let {definition, resourceDataMap, resourceMap} = this.syncableSubjectDataMap.get(subject)!;

    let resourceData = resourceDataMap.get(resource);
    let object = resourceMap.get(resource);

    if (isEqual(object, broadcastSnapshot)) {
      return;
    }

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

    this.onSyncableChange({
      subject,
      resource,
      snapshot: snapshotBeforeChange,
      object,
    });
  }

  private updateByBroadcast(change: BroadcastChange): void {
    let {uid, subject, resource} = change;
    let {definition, resourceDataMap, resourceMap} = this.syncableSubjectDataMap.get(subject)!;

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

    if (isEqual(object, snapshotBeforeChange)) {
      return;
    }

    resourceMap.set(resource, object);

    this.onSyncableChange({
      subject,
      resource,
      snapshot: snapshotBeforeChange,
      object,
    });
  }

  private removeByBroadcast(removal: BroadcastRemoval): void {
    let {subject, resource} = removal;

    let subjectData = this.syncableSubjectDataMap.get(subject)!;

    let {resourceDataMap, resourceMap} = subjectData;

    let object = resourceMap.get(resource)!;

    if (!object) {
      return;
    }

    resourceDataMap.delete(resource);
    resourceMap.delete(resource);

    this.onSyncableChange({
      subject,
      resource,
      snapshot: object,
      object: undefined,
    });
  }

  private syncChange(change: Change): void {
    this.socket.emit('change', change);
  }

  private onSyncableReady(notification: ReadyNotification<Syncable>): void {
    let compoundSubjectSet = this.syncableSubjectToCompoundSubjectSetMap.get(notification.subject);

    if (compoundSubjectSet) {
      for (let compoundSubject of compoundSubjectSet) {
        this.handleCompoundDependencyReady(compoundSubject, notification);
      }
    }

    this.ready.next(notification);
  }

  private onSyncableChange(notification: ChangeNotification<Syncable>): void {
    let compoundSubjectSet = this.syncableSubjectToCompoundSubjectSetMap.get(notification.subject);

    if (compoundSubjectSet) {
      for (let compoundSubject of compoundSubjectSet) {
        this.handleCompoundDependencyChange(compoundSubject, notification);
      }
    }

    this.change.next(notification);
  }

  private handleCompoundDependencyReady(
    compoundSubject: string,
    {subject}: ReadyNotification<Syncable>,
  ): void {
    let {
      definition,
      resourceMap: compoundResourceMap,
      pendingDependencySet,
      dependencyDataMap,
      dependencyHost,
    } = this.compoundSubjectDataMap.get(compoundSubject)!;

    let {entry, dependencies} = definition;

    for (let dependency of dependencies) {
      let {indexToResourceSetMapMap, resourceMap} = dependencyDataMap.get(dependency.subject)!;
      this.initCompoundDependencyIndexes(resourceMap, indexToResourceSetMapMap, dependency);
    }

    pendingDependencySet.delete(subject);

    if (pendingDependencySet.size) {
      return;
    }

    let {resourceMap: syncableResourceMap} = dependencyDataMap.get(entry)!;

    for (let object of syncableResourceMap.values()) {
      let compound = definition.buildCompound(object, dependencyHost);

      if (compound !== undefined) {
        compoundResourceMap.set(object.uid, compound);
      }
    }

    let absenceSet = new Set<string>();

    for (
      let [
        subject,
        {compoundEntryResolver, resourceMap},
      ] of dependencyDataMap
    ) {
      if (subject === definition.entry) {
        continue;
      }

      for (let object of resourceMap.values()) {
        let entry = compoundEntryResolver(object, dependencyHost);

        if (typeof entry === 'string') {
          absenceSet.add(entry);
        }
      }
    }

    if (absenceSet.size) {
      this.request(definition.entry, Array.from(absenceSet));
    }

    this.ready.next({
      subject: compoundSubject,
      resourceMap: compoundResourceMap,
    });
  }

  private initCompoundDependencyIndexes(
    resourceMap: Map<string, Syncable>,
    indexToResourceSetMapMap: Map<string, Map<any, Set<Syncable>>>,
    {options: {indexes = []}}: Dependency<Syncable, Syncable>,
  ): void {
    for (let object of resourceMap.values()) {
      for (let key of indexes) {
        let indexToResourceSetMap = indexToResourceSetMapMap.get(key)!;

        let index = object[key];

        if (index) {
          let resourceSet = indexToResourceSetMap.get(index);

          if (resourceSet) {
            resourceSet.add(object);
          } else {
            resourceSet = new Set([object]);
            indexToResourceSetMap.set(index, resourceSet);
          }
        }
      }
    }
  }

  private handleCompoundDependencyChange(
    compoundSubject: string,
    {subject, snapshot, object}: ChangeNotification<Syncable>,
  ): void {
    let {
      definition,
      resourceMap,
      pendingDependencySet,
      dependencyDataMap,
      dependencyHost,
    } = this.compoundSubjectDataMap.get(compoundSubject)!;

    if (pendingDependencySet.size) {
      return;
    }

    let {indexToResourceSetMapMap, compoundEntryResolver} = dependencyDataMap.get(subject)!;

    for (let [key, indexToResourceSetMap] of indexToResourceSetMapMap) {
      if (snapshot) {
        let index = (snapshot as any)[key];

        if (index) {
          indexToResourceSetMap.get(index)!.delete(snapshot);
        }
      }

      if (object) {
        let index = (object as any)[key];

        if (index) {
          let resourceSet = indexToResourceSetMap.get(index);

          if (resourceSet) {
            resourceSet.add(object);
          } else {
            resourceSet = new Set([object]);
            indexToResourceSetMap.set(index, resourceSet);
          }
        }
      }
    }

    let updateCompound = (entry: Syncable | string) => {
      if (typeof entry === 'string') {
        this.request(definition.entry, [entry]);
        return;
      }

      let {uid} = entry;

      let compoundSnapshot = resourceMap.get(uid);
      let compound = definition.buildCompound(entry, dependencyHost);

      if (isEqual(compound, compoundSnapshot)) {
        return;
      }

      if (compound !== undefined) {
        resourceMap.set(uid, compound);
      } else {
        resourceMap.delete(uid);
      }

      this.change.next({
        subject: compoundSubject,
        resource: uid,
        snapshot: compoundSnapshot,
        object: compound,
      });
    };

    let removeCompound = ({uid}: Syncable) => {
      let compoundSnapshot = resourceMap.get(uid);

      if (compoundSnapshot === undefined) {
        return;
      }

      resourceMap.delete(uid);

      this.change.next({
        subject: compoundSubject,
        resource: uid,
        snapshot: compoundSnapshot,
        object: undefined,
      });
    };

    if (subject === definition.entry) {
      if (object) {
        updateCompound(object);
      } else if (snapshot) {
        removeCompound(snapshot);
      }

      return;
    }

    let previousEntry = snapshot && compoundEntryResolver(snapshot, dependencyHost);
    let entry = object && compoundEntryResolver(object, dependencyHost);

    if (entry) {
      updateCompound(entry);
    }

    if (previousEntry && previousEntry !== entry) {
      updateCompound(previousEntry);
    }
  }
}

function shiftFirstChangeIfMatch(changes: Change[], uid: string): void {
  let change = changes[0];

  if (change && change.uid === uid) {
    changes.shift();
  }
}
