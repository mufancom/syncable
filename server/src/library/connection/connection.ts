import {
  ChangePacket,
  ClientRPCDefinition,
  ConnectionRPCDefinition,
  ISyncable,
  ISyncableAdapter,
  RPCError,
  RPCMethod,
  RPCPeer,
  RPCPeerType,
  SyncData,
  SyncDataUpdateEntry,
  SyncUpdateSource,
  SyncableContainer,
  SyncableRef,
  getSyncableKey,
  getSyncableRef,
} from '@syncable/core';
import _ from 'lodash';
import {Observable, Subject, Subscription} from 'rxjs';
import {concatMap, ignoreElements} from 'rxjs/operators';
import {Dict} from 'tslang';

import {filterReadableSyncables} from '../@utils';
import {BroadcastChangeResult, IServerGenericParams, Server} from '../server';
import {GeneralViewQuery, ViewQueryFilter} from '../view-query';

import {IConnectionAdapter} from './connection-adapter';

interface ISyncableLoadingOptions {
  resolve(): void;
  reject(error: RPCError): void;
}

interface SyncableLoadingQueryOptions extends ISyncableLoadingOptions {
  queryUpdate: object;
  initialize: boolean;
}

interface SyncableLoadingRequestOptions extends ISyncableLoadingOptions {
  refs: SyncableRef[];
}

type SyncableLoadingOptions =
  | SyncableLoadingQueryOptions
  | SyncableLoadingRequestOptions;

export class Connection<TGenericParams extends IServerGenericParams>
  extends RPCPeer<ClientRPCDefinition>
  implements RPCPeerType<ConnectionRPCDefinition> {
  readonly close$: Observable<void>;

  private container: SyncableContainer;

  private viewQueryFilterMap = new Map<string, ViewQueryFilter>();

  private loadedKeySet = new Set<string>();

  private loading = true;
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

    this.container = new SyncableContainer(syncableAdapter);

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

  async initialize(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.loadingScheduler.next({
        queryUpdate: this.connectionAdapter.viewQuery,
        initialize: true,
        resolve,
        reject,
      });
    });

    this.initializeSubject$.complete();
  }

  @RPCMethod()
  async change(packet: ChangePacket): Promise<void> {
    await this.server.applyChangePacket(this.group, packet, this.context);
  }

  @RPCMethod()
  async request(refs: SyncableRef[]): Promise<void> {
    await this.ready;

    return new Promise((resolve, reject) => {
      this.loadingScheduler.next({
        refs,
        resolve,
        reject,
      });
    });
  }

  @RPCMethod()
  async 'update-view-query'(update: object): Promise<void> {
    await this.ready;

    return new Promise((resolve, reject) => {
      this.loadingScheduler.next({
        queryUpdate: update,
        initialize: false,
        resolve,
        reject,
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
    let group = this.group;
    let context = this.context;
    let container = this.container;

    let viewQueryOptionsDict: Dict<object> = {};

    let viewQueryFilterMap = this.viewQueryFilterMap;

    let queryEntries = Object.entries(update) as [string, GeneralViewQuery][];

    let refs = _.uniqBy(
      _.flatMap(queryEntries, ([, query]) => Object.values(query.refs)),
      ref => getSyncableKey(ref),
    ).filter(ref => !container.existsSyncable(ref));

    if (refs.length) {
      let syncables = await this.server.loadSyncablesByRefs(
        group,
        context,
        refs,
        undefined,
        false,
      );

      for (let syncable of syncables) {
        container.addSyncable(syncable);
      }
    }

    for (let [name, descriptor] of queryEntries) {
      if (descriptor) {
        let {refs: refDict, options} = descriptor;

        let syncableDict = container.buildSyncableDict(refDict);

        let filter = this.server.getViewQueryFilter(
          name,
          syncableDict,
          options,
        );

        viewQueryFilterMap.set(name, filter);
        viewQueryOptionsDict[name] = descriptor;
      } else {
        viewQueryFilterMap.delete(name);
      }
    }

    let loadedKeySet = this.loadedKeySet;

    let syncables = await this.server.loadSyncablesByQuery(
      this.group,
      context,
      viewQueryOptionsDict,
      loadedKeySet,
    );

    syncables = syncables.filter(this.viewQueryFilter);

    let contextRef = context.ref;
    let contextKey = getSyncableKey(contextRef);

    for (let syncable of syncables) {
      let key = getSyncableKey(syncable);

      loadedKeySet.add(key);

      if (key === contextKey) {
        container.addSyncable(syncable);

        let contextObject = container.requireSyncableObject(contextRef);

        context.setObject(contextObject);
      }
    }

    let data: SyncData = {
      syncables,
      removals: [],
      updates: [],
    };

    if (toInitialize) {
      if (!context.object) {
        throw new RPCError('INVALID_CONTEXT');
      }

      if (context.disabled) {
        throw new RPCError('CONTEXT_DISABLED');
      }

      await this.call('initialize', data, contextRef);
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
      true,
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
