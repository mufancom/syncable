import {
  ChangePacket,
  ClientRPCDefinition,
  ConnectionRPCDefinition,
  ISyncable,
  ISyncableAdapter,
  IViewQuery,
  RPCError,
  RPCMethod,
  RPCPeer,
  RPCPeerType,
  ResolvedViewQuery,
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
import {BroadcastChangeResult, IServerGenericParams, Server} from '../server';

import {IConnectionAdapter} from './connection-adapter';

interface ViewQueryInfo {
  filter: ViewQueryFilter;
  query: IViewQuery;
}

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

export class Connection<TGenericParams extends IServerGenericParams>
  extends RPCPeer<
    ClientRPCDefinition | TGenericParams['customClientRPCDefinition']
  >
  implements RPCPeerType<ConnectionRPCDefinition> {
  readonly context: TGenericParams['context'];

  readonly close$: Observable<void>;

  private container: SyncableContainer;

  private nameToViewQueryInfoMap = new Map<string, ViewQueryInfo>();

  private loadedKeySet = new Set<string>();

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

  async initialize(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.loadingScheduler.next({
        type: 'initialize',
        queryUpdate: this.connectionAdapter.viewQueryDict as Dict<IViewQuery>,
        resolve,
        reject,
      });
    });

    this.initializeSubject$.complete();
  }

  @RPCMethod()
  async 'apply-change'(packet: ChangePacket): Promise<void> {
    await this.ready;

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

    for (let {snapshot} of updateItems) {
      container.updateMatchingSyncable(snapshot);
    }

    let contextObject = container.getSyncableObject(context.ref);

    if (!contextObject || context.disabled) {
      connectionAdapter.close();
    }

    let keyToViewQueryNameSet = new Map<string, Set<string>>();

    let nameToViewQueryInfoMap = this.nameToViewQueryInfoMap;

    for (let [
      name,
      {
        query: {refs: refDict},
      },
    ] of nameToViewQueryInfoMap) {
      for (let ref of Object.values(refDict)) {
        let key = getSyncableKey(ref);

        let nameSet = keyToViewQueryNameSet.get(key);

        if (nameSet) {
          nameSet.add(name);
        } else {
          keyToViewQueryNameSet.set(key, new Set([name]));
        }
      }
    }

    let relevantViewQueryNames = _.uniq(
      _.flatMap(updateItems, item => {
        let nameSet = keyToViewQueryNameSet.get(getSyncableKey(item.snapshot));
        return nameSet ? Array.from(nameSet) : [];
      }),
    );

    let relevantViewQueryUpdate = relevantViewQueryNames.reduce(
      (update, name) => {
        update[name] = nameToViewQueryInfoMap.get(name)!.query;
        return update;
      },
      {} as Dict<IViewQuery>,
    );

    this['update-view-query'](relevantViewQueryUpdate).catch(console.error);

    let loadedKeySet = this.loadedKeySet;

    let viewQueryFilter = this.viewQueryFilter;

    let syncables: ISyncable[] = [];
    let removals: SyncableRef[] = [];
    let updates: SyncDataUpdateEntry[] = [];

    syncables.push(
      ...filterReadableSyncables(
        context,
        syncableAdapter,
        createdSyncables.filter(viewQueryFilter),
      ),
    );

    let dependencyRelevantSyncables = [...syncables];

    for (let ref of removedSyncableRefs) {
      let key = getSyncableKey(ref);

      if (loadedKeySet.has(key)) {
        loadedKeySet.delete(key);
        removals.push(ref);
      }
    }

    for (let {snapshot, diffs} of updateItems) {
      let readable = syncableAdapter
        .instantiate(snapshot)
        .testAccessRights(['read'], context);

      let key = getSyncableKey(snapshot);

      if (loadedKeySet.has(key)) {
        let ref = getSyncableRef(snapshot);

        if (readable) {
          updates.push({ref, diffs});
          dependencyRelevantSyncables.push(snapshot);
        } else {
          loadedKeySet.delete(key);
          removals.push(ref);
        }
      } else {
        if (readable && viewQueryFilter(snapshot)) {
          loadedKeySet.add(key);
          syncables.push(snapshot);
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

    for (let syncable of dependentSyncables) {
      loadedKeySet.add(getSyncableKey(syncable));
    }

    syncables.push(...dependentSyncables);

    let data: SyncData = {
      syncables,
      removals,
      updates,
    };

    let source: SyncUpdateSource = {
      id,
      clock,
    };

    await (this as RPCPeer<ClientRPCDefinition>).call('sync', data, source);
  }

  private async query(
    update: ViewQueryUpdateObject,
    toInitialize: boolean,
  ): Promise<void> {
    let group = this.group;
    let context = this.context;
    let container = this.container;
    let server = this.server;

    let syncableAdapter = this.syncableAdapter;

    let queryEntries = Object.entries(update);

    let refs = _.uniqBy(
      _.flatMap(queryEntries, ([, query]) =>
        query ? Object.values(query.refs) : [],
      ),
      ref => getSyncableKey(ref),
    ).filter(ref => !container.existsSyncable(ref));

    if (refs.length) {
      let syncables = await server.loadSyncablesByRefs(group, context, refs, {
        loadRequisiteDependencyOnly: true,
      });

      for (let syncable of syncables) {
        container.addSyncable(syncable);
      }
    }

    let viewQueryInfoMap = this.nameToViewQueryInfoMap;

    let resolvedViewQueryDict: Dict<ResolvedViewQuery> = {};

    for (let [name, query] of queryEntries) {
      if (query) {
        let {refs: refDict, options} = query;

        let syncableDict = container.buildSyncableDict(refDict);

        let resolvedViewQuery = {
          syncables: syncableDict,
          options,
        };

        let filter = syncableAdapter.getViewQueryFilter(
          context,
          name,
          resolvedViewQuery,
        );

        viewQueryInfoMap.set(name, {
          filter,
          query,
        });

        resolvedViewQueryDict[name] = resolvedViewQuery;
      } else {
        viewQueryInfoMap.delete(name);
      }
    }

    let loadedKeySet = this.loadedKeySet;

    let syncables = await server.loadSyncablesByQuery(
      group,
      context,
      resolvedViewQueryDict,
      loadedKeySet,
    );

    for (let syncable of syncables) {
      loadedKeySet.add(getSyncableKey(syncable));
    }

    let data: SyncData = {
      syncables,
      removals: [],
      updates: [],
    };

    if (toInitialize) {
      let contextRef = context.ref;
      let contextKey = getSyncableKey(contextRef);

      for (let syncable of syncables) {
        if (getSyncableKey(syncable) === contextKey) {
          container.addSyncable(syncable);

          let contextObject = container.requireSyncableObject(contextRef);

          context.setObject(contextObject);
        }
      }

      if (!context.object) {
        throw new RPCError('INVALID_CONTEXT');
      }

      if (context.disabled) {
        throw new RPCError('CONTEXT_DISABLED');
      }

      let connectionAdapter = this.connectionAdapter;

      await (this as RPCPeer<ClientRPCDefinition>).call(
        'initialize',
        data,
        contextRef,
        connectionAdapter.viewQueryDict,
      );
    } else {
      await (this as RPCPeer<ClientRPCDefinition>).call('sync', data);
    }
  }

  private async request(refs: SyncableRef[]): Promise<void> {
    let loadedKeySet = this.loadedKeySet;

    let syncables = await this.server.loadSyncablesByRefs(
      this.group,
      this.context,
      refs,
      {
        loadedKeySet,
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
