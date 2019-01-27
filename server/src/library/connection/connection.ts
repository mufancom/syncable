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
  UpdateViewQueryData,
  getSyncableKey,
  getSyncableRef,
} from '@syncable/core';
import {Observable, Subject, Subscription} from 'rxjs';
import {concatMap, ignoreElements} from 'rxjs/operators';

import {filterReadableSyncables} from '../@utils';
import {BroadcastChangeResult, IServerGenericParams, Server} from '../server';
import {ViewQueryFilter} from '../view-query';

import {IConnectionAdapter} from './connection-adapter';

interface SyncableLoadingQueryOptions {
  queryMap: Map<string, object>;
}

interface SyncableLoadingRequestOptions {
  refs: SyncableRef[];
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

  constructor(
    readonly server: Server<TGenericParams>,
    readonly group: string,
    readonly context: TGenericParams['context'],
    connectionAdapter: IConnectionAdapter,
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
              await this.query(options.queryMap);
            }

            this.flushPendingChangeResults();

            this.loading = false;
          }),
        )
        .subscribe(),
    );
  }

  private get viewQueryFilter(): ViewQueryFilter {
    let filters = Array.from(this.viewQueryFilterMap.values());

    return syncable => filters.some(filter => filter(syncable));
  }

  async initialize(): Promise<void> {}

  dispose(): void {
    super.dispose();

    this.subscription.unsubscribe();
  }

  handleBroadcastChangeResult(result: BroadcastChangeResult): void {
    if (this.loading) {
      this.pendingChangeResults.push(result);
      return;
    }
  }

  @RPCMethod()
  async change(packet: ChangePacket): Promise<void> {
    await this.server.applyChangePacket(this.group, packet, this.context);
  }

  @RPCMethod()
  request(refs: SyncableRef[]): void {
    this.loadingScheduler.next({refs});
  }

  @RPCMethod()
  'update-view-query'(data: UpdateViewQueryData): void {
    let filterMap = this.viewQueryFilterMap;

    let queryMap = new Map<string, object>();

    for (let [name, query] of Object.entries(data)) {
      if (query) {
        let filter = this.server.getViewQueryFilter(name, query);
        filterMap.set(name, filter);
        queryMap.set(name, query);
      } else {
        filterMap.delete(name);
      }
    }

    if (queryMap.size) {
      this.loadingScheduler.next({queryMap});
    }
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

  private async query(_queryMap: Map<string, object>): Promise<void> {}

  private async load(_refs: SyncableRef[]): Promise<void> {}
}
