import * as difference from 'lodash.difference';
import * as isEqual from 'lodash.isequal';
import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';
import * as uuid from 'uuid';

import 'rxjs/add/observable/from';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/toPromise';

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

import { SyncableDefinition } from './definition';

import {
  CompoundDefinition,
  CompoundEntryResolver,
  Dependency,
} from './compound-definition';

export interface Socket<TClientSession> extends SocketIOClient.Socket {
  on(event: 'reconnect', listener: (attempt: number) => void): this;
  on(event: 'subscribed', listener: (subscription: Subscription) => void): this;
  on(event: 'change', listener: (change: ClientBroadcastChangeData<BroadcastChange, TClientSession>) => void): this;
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
  resourceDataMap: Map<string, SyncableResourceData<T>>;
  resourceMap: Map<string, T>;
}

export interface DependencyData<T extends Syncable, TEntry extends Syncable> {
  indexToResourceSetMapMap: Map<string, Map<string, Set<T>>>;
  resourceMap: Map<string, T>;
  requestAbsentEntries: boolean;
  compoundEntryResolver: CompoundEntryResolver<T, TEntry>;
}

interface CompoundSubjectData<T, TClientSession> {
  definition: CompoundDefinition<T, Syncable, TClientSession>;
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
  before: T | undefined;
}

export class CompoundDependencyHost {
  constructor(
    private dependencyDataMap: Map<string, DependencyData<Syncable, Syncable>>,
  ) { }

  getDependencyResource<TDependency extends Syncable>(subject: string, uid: string): TDependency | undefined {
    let {resourceMap} = this.dependencyDataMap.get(subject)!;
    return resourceMap.get(uid) as TDependency;
  }

  getDependencyResources<TDependency extends Syncable>(subject: string, uids: string[]): TDependency[] {
    let {resourceMap} = this.dependencyDataMap.get(subject)!;

    let dependencies: TDependency[] = [];

    for (let uid of uids) {
      let dependency = resourceMap.get(uid) as TDependency | undefined;

      if (dependency) {
        dependencies.push(dependency);
      }
    }

    return dependencies;
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

export class Client<TClientSession> {
  private subjectToReadyPromiseMap = new Map<string, Promise<ReadyNotification<any>>>();
  private subjectToReadyObservableMap = new Map<string, Subject<ReadyNotification<any>>>();
  private subjectToChangeObservableMap = new Map<string, Subject<ChangeNotification<any>>>();

  private socket: Socket<TClientSession>;
  private syncableSubjectDataMap = new Map<string, SyncableSubjectData<Syncable, TClientSession>>();
  private compoundSubjectDataMap = new Map<string, CompoundSubjectData<any, any>>();
  private syncableSubjectToCompoundSubjectSetMap = new Map<string, Set<string>>();

  private subjectToPendingRequestResourceSetMap: Map<string, Set<string>> | undefined;
  private syncingChange = new Subject<boolean>();
  private syncingChangeSet = new Set<string>();

  constructor(
    socket: SocketIOClient.Socket,
    public session: TClientSession,
  ) {
    this.socket = socket as Socket<TClientSession>;
  }

  get syncing(): Observable<boolean> {
    return Observable.from(this.syncingChange);
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
      resourceMap: new Map<string, T>(),
      resourceDataMap: new Map<string, SyncableResourceData<T>>(),
    });

    this.initNotifications(subject);
  }

  registerCompound<T, TEntry extends Syncable>(
    subject: string,
    definition: CompoundDefinition<T, TEntry, TClientSession>,
  ): void {
    let {compoundSubjectDataMap, syncableSubjectToCompoundSubjectSetMap} = this;
    let {dependencies} = definition;

    let dependencyDataMap = new Map<string, DependencyData<Syncable, TEntry>>();

    for (
      let {
        subject: syncableSubject,
        options: {
          indexes = [],
          requestAbsentEntries = false,
          compoundEntryResolver,
        },
      } of dependencies
    ) {
      let indexToResourceSetMapMap = new Map(
        indexes.map<[string, Map<string, Set<Syncable>>]>(key => [
          key,
          new Map<string, Set<Syncable>>(),
        ]),
      );

      dependencyDataMap.set(syncableSubject, {
        indexToResourceSetMapMap,
        compoundEntryResolver,
        requestAbsentEntries,
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

    let subjectData: CompoundSubjectData<T, TClientSession> = {
      definition,
      resourceMap: new Map<string, T>(),
      pendingDependencySet: new Set(dependencies.map(({subject}) => subject)),
      dependencyDataMap,
      dependencyHost: new CompoundDependencyHost(dependencyDataMap),
    };

    compoundSubjectDataMap.set(subject, subjectData);

    this.initNotifications(subject);
  }

  init(): void {
    for (let {definition} of this.compoundSubjectDataMap.values()) {
      definition._client = this;
    }

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
      let {subject, uid} = change;

      this.syncingChangeSet.delete(uid);

      if (this.syncingChangeSet.size === 0) {
        this.syncingChange.next(false);
      }

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

  getResourceMap<T extends Syncable>(subject: string): Map<string, T> {
    return this.syncableSubjectDataMap.get(subject)!.resourceMap as Map<string, T>;
  }

  getCompoundResourceMap<T>(subject: string): Map<string, T> {
    return this.compoundSubjectDataMap.get(subject)!.resourceMap as Map<string, T>;
  }

  getReadyPromise<T>(subject: string): Promise<ReadyNotification<T>> {
    return this.subjectToReadyPromiseMap.get(subject)!;
  }

  getReadyObservable<T extends Syncable>(subject: string): Observable<ReadyNotification<T>> {
    return this.subjectToReadyObservableMap.get(subject)!.first();
  }

  getChangeObservable<T extends Syncable>(subject: string): Observable<ChangeNotification<T>> {
    return this.subjectToChangeObservableMap.get(subject)!.first();
  }

  request(subject: string, resources: string[]): void {
    if (!this.subjectToPendingRequestResourceSetMap) {
      this.subjectToPendingRequestResourceSetMap = new Map<string, Set<string>>();
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

  create(rawCreation: RawCreation, serverCreation = false): Syncable | undefined {
    if (serverCreation) {
      let serverChange: ServerCreation = {
        uid: uuid(),
        type: 'create',
        ...rawCreation,
      };

      this.syncChange(serverChange);

      return undefined;
    }

    let resource = uuid();

    let change: ClientCreation = {
      uid: uuid(),
      resource,
      type: 'create',
      ...rawCreation,
    };

    let {subject} = change;
    let {definition, resourceDataMap, resourceMap} = this.syncableSubjectDataMap.get(subject)!;

    definition.preprocessChange(change);

    let snapshot = definition.create(change, this.session);

    let object: Syncable = {
      ...snapshot,
      syncing: true,
    };

    if (!definition.testVisibility(object)) {
      throw new Error(`The object created is not visible at creation: ${JSON.stringify(object)}`);
    }

    let resourceData: SyncableResourceData<Syncable> = {
      snapshot,
      changes: [change],
    };

    resourceDataMap.set(resource, resourceData);
    resourceMap.set(resource, object);

    this.onSyncableChange({
      subject,
      resource,
      before: undefined,
      object,
    });

    this.syncChange(change);

    return object;
  }

  update(rawChange: RawChange): void {
    let change: Change = {
      uid: uuid(),
      ...rawChange,
    };

    let {subject, resource} = change;
    let {definition, resourceDataMap, resourceMap} = this.syncableSubjectDataMap.get(subject)!;

    definition.preprocessChange(change);

    let {changes} = resourceDataMap.get(resource)!;
    let object: Syncable | undefined = resourceMap.get(resource)!;

    let {syncing: _, ...objectBeforeChange} = object;

    object = definition.update(objectBeforeChange, change, this.session);

    if (isEqual(object, objectBeforeChange)) {
      return;
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

    this.onSyncableChange({
      subject,
      resource,
      before: objectBeforeChange,
      object,
    });

    this.syncChange(change);
  }

  remove(rawRemoval: RawRemoval): void {
    let change: Removal = {
      uid: uuid(),
      type: 'remove',
      ...rawRemoval,
    };

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
      before: object,
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

    let objectBeforeChange: Syncable | undefined;

    if (resourceData && object) {
      let {syncing: _, ...objectWithoutSyncing} = object;

      objectBeforeChange = objectWithoutSyncing;

      let {changes} = resourceData;

      shiftPrecedingChangesIfMatch(changes, uid);

      object = broadcastSnapshot;

      for (let change of changes) {
        object = definition.update(object, change, this.session);
      }

      resourceData.snapshot = object;
      resourceMap.set(resource, object);
    } else {
      object = broadcastSnapshot;

      resourceData = {
        snapshot: object,
        changes: [],
      };

      resourceDataMap.set(resource, resourceData);
      resourceMap.set(resource, object);
    }

    this.onSyncableChange({
      subject,
      resource,
      before: objectBeforeChange,
      object,
    });
  }

  private updateByBroadcast(change: BroadcastChange, session: TClientSession): void {
    let {uid, subject, resource, timestamp} = change;
    let {definition, resourceDataMap, resourceMap} = this.syncableSubjectDataMap.get(subject)!;

    let object = resourceMap.get(resource)!;
    let {syncing: _, ...objectBeforeChange} = object;

    let resourceData = resourceDataMap.get(resource)!;
    let {snapshot, changes} = resourceData;

    shiftPrecedingChangesIfMatch(changes, uid);

    object = definition.update(snapshot, change, session);

    for (let change of changes) {
      object = definition.update(object, change, this.session);
    }

    object = {...object, timestamp};

    if (isEqual(object, objectBeforeChange)) {
      return;
    }

    resourceData.snapshot = object;
    resourceMap.set(resource, object);

    this.onSyncableChange({
      subject,
      resource,
      before: objectBeforeChange,
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
      before: object,
      object: undefined,
    });
  }

  private initNotifications(subject: string): void {
    let readySubject = new Subject<ReadyNotification<any>>();
    let changeSubject = new Subject<ChangeNotification<any>>();

    this.subjectToReadyObservableMap.set(subject, readySubject);
    this.subjectToChangeObservableMap.set(subject, changeSubject);

    let promise = readySubject.first().toPromise();

    this.subjectToReadyPromiseMap.set(subject, promise);
  }

  private syncChange(change: Change | ServerCreation): void {
    let {uid} = change;

    this.syncingChangeSet.add(uid);
    this.syncingChange.next(true);

    this.socket.emit('change', change);
  }

  private onSyncableReady(notification: ReadyNotification<Syncable>): void {
    let {subject} = notification;

    let compoundSubjectSet = this.syncableSubjectToCompoundSubjectSetMap.get(subject);

    if (compoundSubjectSet) {
      for (let compoundSubject of compoundSubjectSet) {
        this.handleCompoundDependencyReady(compoundSubject, notification);
      }
    }

    this.subjectToReadyObservableMap.get(subject)!.next(notification);
  }

  private onSyncableChange(notification: ChangeNotification<Syncable>): void {
    let {subject} = notification;

    let compoundSubjectSet = this.syncableSubjectToCompoundSubjectSetMap.get(subject);

    if (compoundSubjectSet) {
      for (let compoundSubject of compoundSubjectSet) {
        this.handleCompoundDependencyChange(compoundSubject, notification);
      }
    }

    this.subjectToChangeObservableMap.get(subject)!.next(notification);
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

    pendingDependencySet.delete(subject);

    if (pendingDependencySet.size) {
      return;
    }

    let {entry, dependencies} = definition;

    for (let dependency of dependencies) {
      let {indexToResourceSetMapMap, resourceMap} = dependencyDataMap.get(dependency.subject)!;
      this.initCompoundDependencyIndexes(resourceMap, indexToResourceSetMapMap, dependency);
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
        {compoundEntryResolver, resourceMap, requestAbsentEntries},
      ] of dependencyDataMap
    ) {
      if (subject === definition.entry || !requestAbsentEntries) {
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

    this.subjectToReadyObservableMap
      .get(compoundSubject)!
      .next({
        subject: compoundSubject,
        resourceMap: compoundResourceMap,
      });
  }

  private initCompoundDependencyIndexes(
    resourceMap: Map<string, Syncable>,
    indexToResourceSetMapMap: Map<string, Map<string, Set<Syncable>>>,
    {options: {indexes = []}}: Dependency<Syncable, Syncable>,
  ): void {
    for (let object of resourceMap.values()) {
      for (let key of indexes) {
        let indexToResourceSetMap = indexToResourceSetMapMap.get(key)!;

        let indexes = object[key] as string | string[];

        if (indexes) {
          indexes = Array.isArray(indexes) ? indexes : [indexes];

          for (let index of indexes) {
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
  }

  private handleCompoundDependencyChange(
    compoundSubject: string,
    {subject, before, object}: ChangeNotification<Syncable>,
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
      if (before) {
        let indexes = (before as any)[key] as string | string[];

        if (indexes) {
          indexes = Array.isArray(indexes) ? indexes : [indexes];

          for (let index of indexes) {
            indexToResourceSetMap.get(index)!.delete(before);
          }
        }
      }

      if (object) {
        let indexes = (object as any)[key] as string | string[];

        if (indexes) {
          indexes = Array.isArray(indexes) ? indexes : [indexes];

          for (let index of indexes) {
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

    let updateCompound = (entry: Syncable) => {
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

      this.subjectToChangeObservableMap
        .get(compoundSubject)!
        .next({
          subject: compoundSubject,
          resource: uid,
          before: compoundSnapshot,
          object: compound,
        });
    };

    let removeCompound = ({uid}: Syncable) => {
      let compoundSnapshot = resourceMap.get(uid);

      if (compoundSnapshot === undefined) {
        return;
      }

      resourceMap.delete(uid);

      this.subjectToChangeObservableMap
        .get(compoundSubject)!
        .next({
          subject: compoundSubject,
          resource: uid,
          before: compoundSnapshot,
          object: undefined,
        });
    };

    if (subject === definition.entry) {
      if (object) {
        updateCompound(object);
      } else if (before) {
        removeCompound(before);
      }

      return;
    }

    let previousEntries = before && compoundEntryResolver(before, dependencyHost);
    let entries = object && compoundEntryResolver(object, dependencyHost);

    if (typeof entries === 'string') {
      this.request(definition.entry, [entries]);
    } else if (entries) {
      entries = Array.isArray(entries) ? entries : [entries];

      for (let entry of entries) {
        updateCompound(entry);
      }
    }

    if (previousEntries && typeof previousEntries !== 'string') {
      previousEntries = Array.isArray(previousEntries) ? previousEntries : [previousEntries];

      if (entries && typeof entries !== 'string') {
        previousEntries = difference(previousEntries, entries);
      }

      for (let entry of previousEntries) {
        updateCompound(entry);
      }
    }
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
}

function shiftPrecedingChangesIfMatch(changes: Change[], uid: string): void {
  let index = changes.findIndex(change => change.uid === uid);
  changes.splice(0, index + 1);
}
