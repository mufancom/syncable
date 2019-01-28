import {
  ChangePacket,
  ClientRPCDefinition,
  ConnectionRPCDefinition,
  ISyncable,
  ISyncableAdapter,
  RPCMethod,
  RPCPeer,
  RPCPeerType,
  SyncData,
  SyncDataUpdateEntry,
  SyncUpdateSource,
  SyncableRef,
  getSyncableKey,
  getSyncableRef,
} from '@syncable/core';
import {Observable, Subject, Subscription} from 'rxjs';
import {concatMap, ignoreElements} from 'rxjs/operators';
import {Dict} from 'tslang';

import {filterReadableSyncables} from '../@utils';
import {BroadcastChangeResult, IServerGenericParams, Server} from '../server';
import {ViewQueryFilter} from '../view-query';

import {IConnectionAdapter} from './connection-adapter';

interface SyncableLoadingQueryOptions {
  queryUpdate: object;
  initialize: boolean;
  resolve(): void;
}

interface SyncableLoadingRequestOptions {
  refs: SyncableRef[];
  resolve(): void;
}

type SyncableLoadingOptions =
  | SyncableLoadingQueryOptions
  | SyncableLoadingRequestOptions;

export class Connection<TGenericParams extends IServerGenericParams>
  extends RPCPeer<ClientRPCDefinition>
  implements RPCPeerType<ConnectionRPCDefinition> {
  readonly close$: Observable<void>;

  private viewQueryFilterMap = new Map<string, ViewQueryFilter>();

  private loadedKeySet = new Set<string>();

  private loading = false;
  private loadingScheduler = new Subject<SyncableLoadingOptions>();

  private pendingChangeResults: BroadcastChangeResult[] = [];

  private subscription = new Subscription();

  private initializeSubject$ = new Subject<void>();

  readonly ready = this.initializeSubject$.toPromise();

  constructor(
    readonly server: Server<TGenericParams>,
    readonly group: string,
    readonly context: TGenericParams['context'],
    private connectionAdapter: IConnectionAdapter<TGenericParams>,
    private syncableAdapter: ISyncableAdapter,
  ) {
    super(connectionAdapter);

    if (context.type !== 'user' || context.environment !== 'server') {
      throw new Error('Invalid context');
    }

    this.close$ = connectionAdapter.incoming$.pipe(ignoreElements());

    this.subscription.add(
      this.loadingScheduler
        .pipe(
          concatMap(async options => {
            this.loading = true;

            if ('refs' in options) {
              await this.load(options.refs);
            } else {
              await this.query(options.queryUpdate, options.initialize);
            }

            this.flushPendingChangeResults();

            this.loading = false;

            options.resolve();
          }),
        )
        .subscribe(),
    );
  }

  private get viewQueryFilter(): ViewQueryFilter {
    let filters = Array.from(this.viewQueryFilterMap.values());

    return syncable => filters.some(filter => filter(syncable));
  }

  async initialize(): Promise<void> {
    await new Promise<void>(resolve => {
      this.loadingScheduler.next({
        queryUpdate: this.connectionAdapter.viewQuery,
        initialize: true,
        resolve,
      });
    });

    this.initializeSubject$.complete();
  }

  dispose(): void {
    super.dispose();

    this.subscription.unsubscribe();
  }

  handleBroadcastChangeResult(result: BroadcastChangeResult): void {
    if (this.loading) {
      this.pendingChangeResults.push(result);
    } else {
      this.syncChange(result);
    }
  }

  @RPCMethod()
  async change(packet: ChangePacket): Promise<void> {
    await this.server.applyChangePacket(this.group, packet, this.context);
  }

  @RPCMethod()
  async request(refs: SyncableRef[]): Promise<void> {
    await this.ready;

    return new Promise(resolve => {
      this.loadingScheduler.next({
        refs,
        resolve,
      });
    });
  }

  @RPCMethod()
  async 'update-view-query'(update: object): Promise<void> {
    await this.ready;

    return new Promise(resolve => {
      this.loadingScheduler.next({
        queryUpdate: update,
        initialize: false,
        resolve,
      });
    });
  }

  private flushPendingChangeResults(): void {
    let results = this.pendingChangeResults;

    for (let result of results) {
      this.syncChange(result);
    }

    results.length = 0;
  }

  private syncChange({
    id,
    clock,
    creations: createdSyncables,
    removals: removedSyncableRefs,
    updates: updateItems,
  }: BroadcastChangeResult): void {
    let context = this.context;
    let syncableAdapter = this.syncableAdapter;

    let loadedKeySet = this.loadedKeySet;

    let viewQueryFilter = this.viewQueryFilter;

    let syncables: ISyncable[] = [];
    let removals: SyncableRef[] = [];
    let updates: SyncDataUpdateEntry[] = [];

    syncables.push(
      ...filterReadableSyncables(
        context,
        syncableAdapter,
        createdSyncables,
      ).filter(viewQueryFilter),
    );

    removals.push(
      ...removedSyncableRefs.filter(ref =>
        loadedKeySet.has(getSyncableKey(ref)),
      ),
    );

    for (let {snapshot, diffs} of updateItems) {
      let readable = syncableAdapter
        .instantiate(snapshot)
        .testAccessRights(['read'], context);

      let key = getSyncableKey(snapshot);

      if (loadedKeySet.has(key)) {
        let ref = getSyncableRef(snapshot);

        if (readable) {
          updates.push({ref, diffs});
        } else {
          removals.push(ref);
        }
      } else {
        if (readable && viewQueryFilter(snapshot)) {
          syncables.push(snapshot);
        }
      }
    }

    let data: SyncData = {
      syncables,
      removals,
      updates,
    };

    let source: SyncUpdateSource = {
      id,
      clock,
    };

    this.call('sync', data, source).catch(console.error);
  }

  private async query(update: object, toInitialize: boolean): Promise<void> {
    let viewQueryObject: Dict<object> = {};

    let viewQueryFilterMap = this.viewQueryFilterMap;

    for (let [name, queryDescriptor] of Object.entries(update)) {
      if (queryDescriptor) {
        let filter = this.server.getViewQueryFilter(name, queryDescriptor);

        viewQueryFilterMap.set(name, filter);
        viewQueryObject[name] = queryDescriptor;
      } else {
        viewQueryFilterMap.delete(name);
      }
    }

    let loadedKeySet = this.loadedKeySet;

    let syncables = await this.server.loadSyncablesByQuery(
      this.group,
      this.context,
      viewQueryObject,
      loadedKeySet,
    );

    syncables = syncables.filter(this.viewQueryFilter);

    for (let syncable of syncables) {
      loadedKeySet.add(getSyncableKey(syncable));
    }

    let data: SyncData = {
      syncables,
      removals: [],
      updates: [],
    };

    if (toInitialize) {
      await this.call('initialize', data, this.context.data);
    } else {
      await this.call('sync', data);
    }
  }

  private async load(refs: SyncableRef[]): Promise<void> {
    let loadedKeySet = this.loadedKeySet;

    let syncables = await this.server.loadSyncablesByRefs(
      this.group,
      this.context,
      refs,
      loadedKeySet,
    );

    for (let syncable of syncables) {
      loadedKeySet.add(getSyncableKey(syncable));
    }

    await this.call('sync', {
      syncables,
      removals: [],
      updates: [],
    });
  }
}
