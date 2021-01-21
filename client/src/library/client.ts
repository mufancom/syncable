import {
  ChangePacket,
  ChangePacketId,
  ChangePlant,
  ChangePlantBlueprint,
  ClientRPCDefinition,
  ConnectionRPCDefinition,
  GeneralChange,
  GeneralViewQuery,
  IChangePlantBlueprintGenericParams,
  IRPCDefinition,
  ISyncable,
  ISyncableAdapter,
  ISyncableObject,
  IViewQuery,
  NumericTimestamp,
  RPCMethod,
  RPCPeer,
  RPCPeerType,
  ResolvedViewQuery,
  ResolvedViewQueryType,
  SyncData,
  SyncUpdateSource,
  SyncableContainer,
  SyncableRef,
  ViewQueryFilter,
  ViewQueryUpdateObject,
  generateUniqueId,
  getSyncableKey,
  getSyncableRef,
  patch,
} from '@syncable/core';
import {Delta} from 'jsondiffpatch';
import _ from 'lodash';
import {action, observable, runInAction, toJS, when} from 'mobx';
import {Subject} from 'rxjs';
import {Dict} from 'tslang';

import {IClientAdapter} from './client-adapter';

const APPLYING_CHANGE_DEFAULT_SERVER_ONLY = false;

interface ViewQueryInfo {
  filter: ViewQueryFilter;
  query: IViewQuery;
}

interface PendingChangeInfo {
  packet: ChangePacket;
  refs: SyncableRef[];
  confirmed: boolean;
}

export interface ClientApplyChangeResult {
  id: ChangePacketId;
  promise: Promise<void>;
}

export interface IClientGenericParams
  extends IChangePlantBlueprintGenericParams {
  syncableObject: ISyncableObject;
  viewQueryDict: object;
  customConnectionRPCDefinition: IRPCDefinition;
}

export class Client<TGenericParams extends IClientGenericParams>
  extends RPCPeer<
    ConnectionRPCDefinition | TGenericParams['customConnectionRPCDefinition']
  >
  implements RPCPeerType<ClientRPCDefinition> {
  readonly container: SyncableContainer;

  @observable
  private _syncing = false;

  @observable
  private pendingQueryingNumber = 0;

  @observable
  private pendingChangeInfos: PendingChangeInfo[] = [];

  private syncableSnapshotMap = new Map<string, ISyncable>();

  @observable
  private nameToViewQueryInfoMap = new Map<string, ViewQueryInfo>();

  private changePlant: ChangePlant;

  private initializeSubject$ = new Subject<void>();

  readonly ready = this.initializeSubject$.toPromise();

  constructor(
    readonly context: TGenericParams['context'],
    private clientAdapter: IClientAdapter<TGenericParams>,
    private syncableAdapter: ISyncableAdapter<TGenericParams>,
    blueprint: ChangePlantBlueprint<TGenericParams>,
  ) {
    super(clientAdapter);

    this.container = new SyncableContainer(syncableAdapter);

    this.changePlant = new ChangePlant(blueprint as ChangePlantBlueprint);

    clientAdapter.connect$.subscribe(this.onConnect);
  }

  get syncing(): boolean {
    return this._syncing;
  }

  get querying(): boolean {
    return this.pendingQueryingNumber !== 0;
  }

  getObjects(): TGenericParams['syncableObject'][];
  getObjects<
    TType extends TGenericParams['syncableObject']['syncable']['_type']
  >(
    type: TType,
  ): Extract<TGenericParams['syncableObject'], {syncable: {_type: TType}}>[];
  getObjects(type?: string): TGenericParams['syncableObject'][] {
    return this.container.getSyncableObjects(
      type,
    ) as TGenericParams['syncableObject'][];
  }

  getObject<TRef extends TGenericParams['syncableObject']['ref']>(
    ref: TRef,
  ): Extract<TGenericParams['syncableObject'], {ref: TRef}> | undefined {
    return this.container.getSyncableObject(ref as SyncableRef) as
      | Extract<TGenericParams['syncableObject'], {ref: TRef}>
      | undefined;
  }

  requireObject<TRef extends TGenericParams['syncableObject']['ref']>(
    ref: TRef,
  ): Extract<TGenericParams['syncableObject'], {ref: TRef}> {
    return this.container.requireSyncableObject(ref as SyncableRef) as Extract<
      TGenericParams['syncableObject'],
      {ref: TRef}
    >;
  }

  async requestObjects<TRef extends TGenericParams['syncableObject']['ref']>(
    refs: TRef[],
  ): Promise<Extract<TGenericParams['syncableObject'], {ref: TRef}>[]> {
    let container = this.container;

    let missingSyncableRefs = refs.filter(
      ref => !container.existsSyncable(ref),
    );

    if (missingSyncableRefs.length) {
      await (this as RPCPeer<ConnectionRPCDefinition>).call(
        'request-syncables',
        missingSyncableRefs,
      );
    }

    return refs
      .map(ref => container.getSyncableObject(ref))
      .filter(
        (
          object,
        ): object is Extract<TGenericParams['syncableObject'], {ref: TRef}> =>
          !!object,
      );
  }

  async requestObject<TRef extends TGenericParams['syncableObject']['ref']>(
    ref: TRef,
  ): Promise<
    Extract<TGenericParams['syncableObject'], {ref: TRef}> | undefined
  > {
    let [object] = await this.requestObjects([ref]);
    return object;
  }

  getViewQueryFilter<
    TName extends Extract<keyof TGenericParams['viewQueryDict'], string>
  >(
    name: TName,
    resolvedViewQuery?: ResolvedViewQueryType<
      TGenericParams['viewQueryDict'][TName]
    >,
  ): ViewQueryFilter<TGenericParams['syncableObject']['syncable']> {
    if (resolvedViewQuery) {
      let context = this.context;
      let syncableAdapter = this.syncableAdapter;

      return syncableAdapter.getViewQueryFilter(
        context,
        name,
        (resolvedViewQuery as unknown) as ResolvedViewQuery,
      );
    } else {
      let info = this.nameToViewQueryInfoMap.get(name);

      return info ? info.filter : () => false;
    }
  }

  async query(
    update: ViewQueryUpdateObject<TGenericParams['viewQueryDict']>,
    forceUpdate?: boolean,
  ): Promise<void>;
  async query(
    update: ViewQueryUpdateObject,
    forceUpdate?: boolean,
  ): Promise<void> {
    runInAction(() => {
      this.pendingQueryingNumber++;
    });

    try {
      await this.ready;
      await this._query(update, forceUpdate);
    } finally {
      runInAction(() => {
        this.pendingQueryingNumber--;
      });
    }
  }

  @action
  applyChange(
    change: TGenericParams['change'] | ChangePacket,
    serverOnly = APPLYING_CHANGE_DEFAULT_SERVER_ONLY,
  ): ClientApplyChangeResult {
    change = _.cloneDeep(change);

    let id: ChangePacketId;
    let packet: ChangePacket;

    if ('id' in change) {
      id = change.id;
      packet = change;
    } else {
      id = generateUniqueId();
      packet = {
        id,
        createdAt: Date.now() as NumericTimestamp,
        ...(change as GeneralChange),
      };
    }

    if (!serverOnly) {
      let info = this.applyChangePacket(packet);

      this.pendingChangeInfos.push(info);

      this._syncing = true;
    }

    let promise = (this as RPCPeer<ConnectionRPCDefinition>).call(
      'apply-change',
      packet,
    );

    promise.catch(() => {
      this.sync(
        {
          syncables: [],
          removals: [],
          updates: [],
          queryMetadata: {},
        },
        {
          id,
          clock: 0,
          completed: true,
        },
      );
    });

    return {id, promise};
  }

  async applyChangeAndConfirm(
    change: TGenericParams['change'],
    serverOnly?: boolean,
  ): Promise<void> {
    let {id, promise} = this.applyChange(change, serverOnly);

    await promise;

    return when(
      () => !this.pendingChangeInfos.some(info => info.packet.id === id),
    );
  }

  @RPCMethod()
  @action
  initialize(
    data: SyncData,
    contextRef: SyncableRef,
    viewQueryUpdateObject: ViewQueryUpdateObject,
  ): void {
    this.container.clear();

    let pendingChangeInfos = this.pendingChangeInfos;

    let pendingPackets = pendingChangeInfos.map(info => info.packet);

    pendingChangeInfos.length = 0;

    this.sync(data);

    this.context.setObject(this.requireObject(contextRef));

    let viewQueryInfoMap = this.nameToViewQueryInfoMap;

    let update: ViewQueryUpdateObject = {};

    for (let [name, {query}] of viewQueryInfoMap) {
      (update as Dict<IViewQuery>)[name] = query;
    }

    viewQueryInfoMap.clear();

    for (let [name, query] of Object.entries(viewQueryUpdateObject)) {
      if (query !== undefined) {
        this.updateViewQueryInfo(name, query);
      }
    }

    this._query(update)
      .then(() => {
        this.initializeSubject$.complete();

        for (let packet of pendingPackets) {
          try {
            this.applyChange(packet);
          } catch (error) {
            console.error(error);
          }
        }
      })
      .catch(console.error);
  }

  @RPCMethod()
  @action
  sync(
    {syncables, removals, updates, queryMetadata}: SyncData,
    source?: SyncUpdateSource,
  ): void {
    for (let [viewQueryName, metadata] of Object.entries(queryMetadata)) {
      this.context.setQueryMetadata(viewQueryName, metadata);
    }

    let container = this.container;

    let pendingChangeInfos = this.pendingChangeInfos;

    let relevantRefs = _.flatMap(pendingChangeInfos, info => info.refs);

    let clock: number | undefined;
    let matchedPendingChangeInfo: PendingChangeInfo | undefined;

    if (source) {
      clock = source.clock;
      matchedPendingChangeInfo = this.shiftPendingChangeInfo(source);
    }

    // Restore relevant syncables

    let syncableSnapshotMap = this.syncableSnapshotMap;

    for (let ref of relevantRefs) {
      let key = getSyncableKey(ref);

      let snapshot = syncableSnapshotMap.get(key);

      if (snapshot) {
        container.addSyncable(snapshot);
      }
    }

    // Apply synced change

    for (let syncable of syncables) {
      this.onUpdateCreate(syncable, clock);
    }

    for (let {ref, delta} of updates) {
      this.onUpdateChange(ref, delta, clock);
    }

    for (let ref of removals) {
      this.onUpdateRemove(ref);
    }

    // Clean obsolete syncables.

    // To avoid reference change, deletion of obsolete syncables need to be
    // applied after updates and pending change packets.

    if (matchedPendingChangeInfo) {
      let obsoleteRefs = matchedPendingChangeInfo.refs.filter(
        ref => !syncableSnapshotMap.has(getSyncableKey(ref)),
      );

      for (let ref of obsoleteRefs) {
        container.removeSyncable(ref);
      }
    }

    if (pendingChangeInfos.length) {
      // Apply pending change.

      for (let i = 0; i < pendingChangeInfos.length; i++) {
        let pendingChangeInfo = pendingChangeInfos[i];

        if (pendingChangeInfo.confirmed) {
          continue;
        }

        pendingChangeInfos[i] = this.applyChangePacket(
          pendingChangeInfo.packet,
        );
      }
    }

    if (!pendingChangeInfos.length) {
      this._syncing = false;
    }
  }

  private onUpdateCreate(syncable: ISyncable, clock: number | undefined): void {
    this.container.addSyncable(syncable, clock);

    let snapshot = _.cloneDeep(syncable);

    this.syncableSnapshotMap.set(getSyncableKey(syncable), snapshot);
  }

  private onUpdateRemove(ref: SyncableRef): void {
    this.container.removeSyncable(ref);
    this.syncableSnapshotMap.delete(getSyncableKey(ref));
  }

  private onUpdateChange(
    ref: SyncableRef,
    delta: Delta,
    clock: number | undefined,
  ): void {
    let snapshot = this.syncableSnapshotMap.get(getSyncableKey(ref))!;

    patch(snapshot, delta);

    this.container.addSyncable(snapshot, clock);
  }

  private async _query(
    update: ViewQueryUpdateObject,
    forceUpdate = false,
  ): Promise<void> {
    update = _.cloneDeep(update);

    let viewQueryInfoMap = this.nameToViewQueryInfoMap;

    let queryEntries = Object.entries(
      update as Dict<GeneralViewQuery | false>,
    ).filter(([name, query]) => {
      let info = viewQueryInfoMap.get(name);

      if (info && _.isEqual(toJS(info.query), query) && !forceUpdate) {
        delete (update as any)[name];
        return false;
      } else {
        return true;
      }
    });

    let refs = _.flatMapDeep<typeof queryEntries[number], SyncableRef>(
      queryEntries,
      ([, query]) => {
        return query ? Object.values(query.refs) : [];
      },
    );

    await this.requestObjects(refs);

    runInAction(() => {
      for (let [name, query] of queryEntries) {
        this.updateViewQueryInfo(name, query);
      }
    });

    if (Object.keys(update).length === 0) {
      return;
    }

    await (this as RPCPeer<ConnectionRPCDefinition>).call(
      'update-view-query',
      update,
    );
  }

  private updateViewQueryInfo(name: string, query: IViewQuery | false): void {
    let context = this.context;
    let container = this.container;
    let syncableAdapter = this.syncableAdapter;

    let viewQueryInfoMap = this.nameToViewQueryInfoMap;

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
        query,
        filter,
      });
    } else {
      viewQueryInfoMap.delete(name);
    }
  }

  private onConnect = async (): Promise<void> => {
    await (this as RPCPeer<ConnectionRPCDefinition>).call(
      'initialize',
      _.fromPairs(
        Array.from(this.nameToViewQueryInfoMap).map(([key, info]) => [
          key,
          info.query,
        ]),
      ),
    );
  };

  private shiftPendingChangeInfo(
    source: SyncUpdateSource,
  ): PendingChangeInfo | undefined {
    let infos = this.pendingChangeInfos;

    let index = infos.findIndex(info => info.packet.id === source.id);

    if (index < 0) {
      return undefined;
    }

    let info = infos[index];

    if (source.completed) {
      infos.splice(0, index + 1);
      return info;
    } else {
      info.confirmed = true;
      return undefined;
    }
  }

  private applyChangePacket(
    packet: ChangePacket,
    confirmed = false,
  ): PendingChangeInfo {
    let container = this.container;

    let {
      updates,
      creations,
      removals,
      notifications,
    } = this.changePlant.process(packet, this.context, container);

    let relevantRefs: SyncableRef[] = [];

    for (let syncable of creations) {
      container.addSyncable(syncable);
      relevantRefs.push(getSyncableRef(syncable));
    }

    for (let {snapshot} of updates) {
      container.addSyncable(snapshot);
      relevantRefs.push(getSyncableRef(snapshot));
    }

    for (let ref of removals) {
      container.removeSyncable(ref);
      relevantRefs.push(ref);
    }

    this.clientAdapter.handleNotifications(notifications, packet.id);

    return {
      packet,
      refs: relevantRefs,
      confirmed,
    };
  }
}
