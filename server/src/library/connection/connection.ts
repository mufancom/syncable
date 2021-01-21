import {
  ChangePacket,
  ChangePacketId,
  ClientRPCDefinition,
  ConnectionRPCDefinition,
  ISyncable,
  ISyncableAdapter,
  IViewQuery,
  RPCError,
  RPCMethod,
  RPCPeer,
  RPCPeerType,
  SyncData,
  SyncDataUpdateEntry,
  SyncUpdateSource,
  SyncableContainer,
  SyncableRef,
  ViewQueryFilter,
  ViewQueryUpdateObject,
  getSyncableKey,
  getSyncableRef,
} from '@syncable/core';
import _ from 'lodash';
import {Observable, Subject, Subscription} from 'rxjs';
import {concatMap, ignoreElements} from 'rxjs/operators';
import {Dict} from 'tslang';

import {filterReadableSyncables} from '../@utils';
import {
  BroadcastChangeResult,
  IServerGenericParams,
  Server,
  ViewQueryInfo,
} from '../server';

import {IConnectionAdapter} from './connection-adapter';

interface ISyncableLoadingOptions<T = void> {
  type: string;
  resolve(value: T): void;
  reject(error: RPCError): void;
}

interface SyncableLoadingInitializeOptions extends ISyncableLoadingOptions {
  type: 'initialize';
  queryUpdate: ViewQueryUpdateObject;
}

interface SyncableLoadingQueryOptions extends ISyncableLoadingOptions {
  type: 'query';
  queryUpdate: ViewQueryUpdateObject;
}

interface SyncableLoadingRequestOptions extends ISyncableLoadingOptions {
  type: 'request';
  refs: SyncableRef[];
}

interface SyncableLoadingChangeOptions extends ISyncableLoadingOptions {
  type: 'change';
  result: BroadcastChangeResult;
}

type SyncableLoadingOptions =
  | SyncableLoadingInitializeOptions
  | SyncableLoadingQueryOptions
  | SyncableLoadingRequestOptions
  | SyncableLoadingChangeOptions;

export class Connection<
  TGenericParams extends IServerGenericParams = IServerGenericParams
>
  extends RPCPeer<
    ClientRPCDefinition | TGenericParams['customClientRPCDefinition']
  >
  implements RPCPeerType<ConnectionRPCDefinition> {
  readonly context: TGenericParams['context'];

  readonly close$: Observable<void>;

  private container: SyncableContainer;

  private nameToViewQueryInfoMap = new Map<string, ViewQueryInfo>();

  private loadedKeySet = new Set<string>();
  private sanitizedFieldNamesMap = new Map<string, string[]>();

  private pendingChangePacketIdSet = new Set<ChangePacketId>();

  private loadingScheduler = new Subject<SyncableLoadingOptions>();

  private subscription = new Subscription();

  private initializeSubject$ = new Subject<void>();

  readonly ready = this.initializeSubject$.toPromise();

  constructor(
    readonly server: Server<TGenericParams>,
    readonly group: string,
    private connectionAdapter: IConnectionAdapter<TGenericParams>,
    private syncableAdapter: ISyncableAdapter,
  ) {
    super(connectionAdapter);

    let context = connectionAdapter.context;

    if (context.type !== 'user' || context.environment !== 'server') {
      throw new Error('Invalid context');
    }

    this.context = context;

    this.container = new SyncableContainer(syncableAdapter);

    this.close$ = connectionAdapter.incoming$.pipe(ignoreElements());

    this.subscription.add(
      this.loadingScheduler
        .pipe(
          concatMap(async options => {
            let ret: unknown;

            switch (options.type) {
              case 'request':
                await this.request(options.refs);
                break;
              case 'initialize':
                await this.query(options.queryUpdate, true);
                break;
              case 'query':
                ret = await this.query(options.queryUpdate, false);
                break;
              case 'change':
                await this.change(options.result);
                break;
            }

            options.resolve(ret as any);
          }),
        )
        .subscribe({
          error(error) {
            console.error(
              error instanceof RPCError
                ? error.message
                : error instanceof Error
                ? error.stack
                : error,
            );

            connectionAdapter.close();
          },
        }),
    );
  }

  private get viewQueryFilter(): ViewQueryFilter {
    let filters = Array.from(this.nameToViewQueryInfoMap).map(
      ([, info]) => info.filter,
    );

    return syncable => filters.some(filter => filter(syncable));
  }

  dispose(): void {
    super.dispose();

    this.subscription.unsubscribe();
  }

  handleBroadcastChangeResult(result: BroadcastChangeResult): void {
    this.loadingScheduler.next({
      type: 'change',
      result,
      resolve() {},
      reject() {},
    });
  }

  @RPCMethod()
  async initialize(viewQueryDict: Dict<IViewQuery>): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.loadingScheduler.next({
        type: 'initialize',
        queryUpdate: {
          ...((this.connectionAdapter.viewQueryDict as unknown) as Dict<
            IViewQuery
          >),
          ...viewQueryDict,
        },
        resolve,
        reject,
      });
    });

    this.initializeSubject$.complete();
  }

  @RPCMethod()
  async 'apply-change'(packet: ChangePacket): Promise<void> {
    await this.ready;

    this.pendingChangePacketIdSet.add(packet.id);

    await this.server.applyChangePacket(this.group, packet, this.context);
  }

  @RPCMethod()
  async 'request-syncables'(refs: SyncableRef[]): Promise<void> {
    await this.ready;

    return new Promise((resolve, reject) => {
      this.loadingScheduler.next({
        type: 'request',
        refs,
        resolve,
        reject,
      });
    });
  }

  @RPCMethod()
  async 'update-view-query'(update: ViewQueryUpdateObject): Promise<void> {
    await this.ready;

    return new Promise((resolve, reject) => {
      this.loadingScheduler.next({
        type: 'query',
        queryUpdate: update,
        resolve,
        reject,
      });
    });
  }

  private async change({
    id,
    clock,
    creations: createdSyncables,
    removals: removedSyncableRefs,
    updates: updateItems,
  }: BroadcastChangeResult): Promise<void> {
    let context = this.context;
    let container = this.container;

    let syncableAdapter = this.syncableAdapter;
    let connectionAdapter = this.connectionAdapter;

    for (let ref of removedSyncableRefs) {
      container.removeSyncable(ref);
    }

    let contextObjectRef = context.ref;
    let contextObjectChanged = false;

    let contextObjectKey = getSyncableKey(contextObjectRef);

    for (let {snapshot} of updateItems) {
      container.updateMatchingSyncable(snapshot);

      if (getSyncableKey(snapshot) === contextObjectKey) {
        contextObjectChanged = true;
      }
    }

    let contextObject = container.getSyncableObject(contextObjectRef);

    if (!contextObject || context.disabled) {
      connectionAdapter.close();
    }

    let relevantViewQueryNames: string[];

    let nameToViewQueryInfoMap = this.nameToViewQueryInfoMap;

    if (contextObjectChanged) {
      relevantViewQueryNames = Array.from(nameToViewQueryInfoMap.keys());
    } else {
      let keyToViewQueryNameSet = new Map<string, Set<string>>();

      for (let [
        name,
        {
          query: {refs: refDict},
        },
      ] of nameToViewQueryInfoMap) {
        for (let refs of Object.values(refDict)) {
          for (let ref of _.castArray(refs)) {
            let key = getSyncableKey(ref);

            let nameSet = keyToViewQueryNameSet.get(key);

            if (nameSet) {
              nameSet.add(name);
            } else {
              keyToViewQueryNameSet.set(key, new Set([name]));
            }
          }
        }
      }

      relevantViewQueryNames = _.union(
        ...updateItems.map(item => {
          let nameSet = keyToViewQueryNameSet.get(
            getSyncableKey(item.snapshot),
          );
          return nameSet ? Array.from(nameSet) : [];
        }),
      );
    }

    let relevantViewQueryUpdate: Dict<IViewQuery> | undefined;

    if (relevantViewQueryNames.length) {
      relevantViewQueryUpdate = relevantViewQueryNames.reduce(
        (update, name) => {
          update[name] = nameToViewQueryInfoMap.get(name)!.query;
          return update;
        },
        {} as Dict<IViewQuery>,
      );
    }

    let loadedKeySet = this.loadedKeySet;
    let sanitizedFieldNamesMap = this.sanitizedFieldNamesMap;

    let viewQueryFilter = this.viewQueryFilter;

    let syncables: ISyncable[] = [];
    let removals: SyncableRef[] = [];
    let updates: SyncDataUpdateEntry[] = [];

    let filteredCreatedSyncables = filterReadableSyncables(
      context,
      syncableAdapter,
      createdSyncables.filter(viewQueryFilter),
    );

    for (let syncable of filteredCreatedSyncables) {
      loadedKeySet.add(getSyncableKey(syncable));
    }

    syncables.push(...filteredCreatedSyncables);

    let dependencyRelevantSyncables = [...syncables];

    for (let ref of removedSyncableRefs) {
      let key = getSyncableKey(ref);

      if (loadedKeySet.has(key)) {
        loadedKeySet.delete(key);
        removals.push(ref);
      }
    }

    for (let {snapshot, delta} of updateItems) {
      let object = syncableAdapter.instantiateBySyncable(snapshot);
      let key = object.key;

      let readable = object.testAccessRights(['read'], context);

      if (loadedKeySet.has(key)) {
        let ref = getSyncableRef(snapshot);

        if (readable) {
          let sanitizedFieldNames = object.getSanitizedFieldNames(context);
          let previouslySanitizedFieldNames =
            sanitizedFieldNamesMap.get(key) ?? [];

          // Shallow clone, as we only delete first-level properties.
          let updatedDelta = _.clone(delta);

          for (let fieldName of _.difference(
            previouslySanitizedFieldNames,
            sanitizedFieldNames,
          )) {
            // Add field
            updatedDelta[fieldName] = [(snapshot as any)[fieldName]];
          }

          for (let fieldName of _.intersection(
            previouslySanitizedFieldNames,
            sanitizedFieldNames,
          )) {
            // Do not change
            delete updatedDelta[fieldName];
          }

          for (let fieldName of _.difference(
            sanitizedFieldNames,
            previouslySanitizedFieldNames,
          )) {
            // Delete field
            updatedDelta[fieldName] = [0, 0, 0];
          }

          // Add field
          updatedDelta['_sanitizedFieldNames'] = [sanitizedFieldNames];

          if (Object.keys(updatedDelta).length) {
            updates.push({
              ref,
              delta: updatedDelta,
            });
          }

          if (sanitizedFieldNames.length) {
            sanitizedFieldNamesMap.set(key, sanitizedFieldNames);
          } else {
            sanitizedFieldNamesMap.delete(key);
          }

          // Is it okay to move this line into the if statement above?
          dependencyRelevantSyncables.push(snapshot);
        } else {
          loadedKeySet.delete(key);
          sanitizedFieldNamesMap.delete(key);
          removals.push(ref);
        }
      } else {
        if (readable && viewQueryFilter(snapshot)) {
          let sanitizedFieldNames = object.getSanitizedFieldNames(context);

          loadedKeySet.add(key);
          sanitizedFieldNamesMap.set(key, sanitizedFieldNames);

          let sanitizedSnapshot = _.omit(
            snapshot,
            sanitizedFieldNames,
          ) as ISyncable;

          sanitizedSnapshot._sanitizedFieldNames = sanitizedFieldNames;

          syncables.push(sanitizedSnapshot);
          dependencyRelevantSyncables.push(snapshot);
        }
      }
    }

    let dependentSyncables = await this.server.loadDependentSyncables(
      this.group,
      context,
      dependencyRelevantSyncables,
      {
        loadedKeySet,
        requisiteOnly: false,
      },
    );

    // loadDependentSyncables has already filtered object without read access,
    // but we need to sanitize fields as well.
    let sanitizedDependentSyncables = filterReadableSyncables(
      context,
      this.syncableAdapter,
      dependentSyncables,
      true,
      (syncable, sanitizedFieldNames) => {
        sanitizedFieldNamesMap.set(
          getSyncableKey(syncable),
          sanitizedFieldNames,
        );
      },
    );

    for (let syncable of sanitizedDependentSyncables) {
      loadedKeySet.add(getSyncableKey(syncable));
    }

    syncables.push(...sanitizedDependentSyncables);

    let data: SyncData = {
      syncables,
      removals,
      updates,
    };

    if (
      !syncables.length &&
      !updates.length &&
      !removals.length &&
      !this.pendingChangePacketIdSet.has(id)
    ) {
      if (relevantViewQueryUpdate) {
        await this.query(relevantViewQueryUpdate, false);
      }
    } else {
      this.pendingChangePacketIdSet.delete(id);

      let source = {
        id,
        clock,
      };

      if (relevantViewQueryUpdate) {
        await (this as RPCPeer<ClientRPCDefinition>).call('sync', data, {
          ...source,
          completed: false,
        });
        await this.query(relevantViewQueryUpdate, false, {
          ...source,
          completed: true,
        });
      } else {
        await (this as RPCPeer<ClientRPCDefinition>).call('sync', data, {
          ...source,
          completed: true,
        });
      }
    }
  }

  private async query(
    update: ViewQueryUpdateObject,
    toInitialize: boolean,
    source?: SyncUpdateSource,
  ): Promise<void> {
    let group = this.group;
    let context = this.context;
    let container = this.container;
    let server = this.server;
    let loadedKeySet = this.loadedKeySet;
    let sanitizedFieldNamesMap = this.sanitizedFieldNamesMap;

    let contextRef = context.ref;

    if (toInitialize) {
      let [contextObjectSyncable] = await server.loadSyncablesByRefs(
        group,
        context,
        [contextRef],
      );

      if (!contextObjectSyncable) {
        throw new RPCError('INVALID_CONTEXT');
      }

      container.addSyncable(contextObjectSyncable);

      let contextObject = container.requireSyncableObject(contextRef);

      context.setObject(contextObject);

      if (context.disabled) {
        throw new RPCError('CONTEXT_DISABLED');
      }
    }

    let {
      syncables,
      nameToViewQueryMapToAdd,
      viewQueryNamesToRemove,
    } = await server._query(group, update, loadedKeySet, container, context);

    syncables = filterReadableSyncables(
      context,
      this.syncableAdapter,
      syncables,
      true,
      (syncable, sanitizedFieldNames) => {
        sanitizedFieldNamesMap.set(
          getSyncableKey(syncable),
          sanitizedFieldNames,
        );
      },
    );

    for (let [name, value] of nameToViewQueryMapToAdd) {
      this.nameToViewQueryInfoMap.set(name, value);
    }

    for (let name of viewQueryNamesToRemove) {
      this.nameToViewQueryInfoMap.delete(name);
    }

    for (let syncable of syncables) {
      loadedKeySet.add(getSyncableKey(syncable));
    }

    let data: SyncData = {
      syncables,
      removals: [],
      updates: [],
    };

    if (toInitialize) {
      await (this as RPCPeer<ClientRPCDefinition>).call(
        'initialize',
        data,
        contextRef,
        this.connectionAdapter.viewQueryDict as ViewQueryUpdateObject,
      );
    } else if (syncables.length || source) {
      await (this as RPCPeer<ClientRPCDefinition>).call('sync', data, source);
    }
  }

  private async request(refs: SyncableRef[]): Promise<void> {
    let loadedKeySet = this.loadedKeySet;
    let sanitizedFieldNamesMap = this.sanitizedFieldNamesMap;

    let syncables = await this.server.loadSyncablesByRefs(
      this.group,
      this.context,
      refs,
      {
        loadedKeySet,
      },
    );

    syncables = filterReadableSyncables(
      this.context,
      this.syncableAdapter,
      syncables,
      true,
      (syncable, sanitizedFieldNames) => {
        sanitizedFieldNamesMap.set(
          getSyncableKey(syncable),
          sanitizedFieldNames,
        );
      },
    );

    for (let syncable of syncables) {
      loadedKeySet.add(getSyncableKey(syncable));
    }

    await (this as RPCPeer<ClientRPCDefinition>).call('sync', {
      syncables,
      removals: [],
      updates: [],
    });
  }
}
