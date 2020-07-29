import {EventEmitter} from 'events';

import {
  ChangePacket,
  ChangePacketId,
  ChangePlant,
  ChangePlantBlueprint,
  ChangePlantProcessingResultWithClock,
  GeneralChange,
  GeneralSyncableRef,
  IChangePlantBlueprintGenericParams,
  IContext,
  IRPCDefinition,
  ISyncable,
  ISyncableAdapter,
  ISyncableObject,
  IViewQuery,
  NumericTimestamp,
  RPCError,
  RefDictToSyncableObjectDict,
  ResolvedViewQuery,
  SyncableContainer,
  SyncableRef,
  ViewQueryFilter,
  ViewQueryUpdateObject,
  generateUniqueId,
  getNonCreationRefsFromRefDict,
  getSyncableKey,
} from '@syncable/core';
import _ from 'lodash';
import {Dict, OmitValueOfKey} from 'tslang';

import {filterReadableSyncables} from '../@utils';
import {Connection} from '../connection';

import {BroadcastChangeResult, IServerAdapter} from './server-adapter';

export interface LoadOptions {
  context?: IContext;
  loadRequisiteDependencyOnly?: boolean;
}

export interface LoadSyncablesByRefsOptions {
  loadedKeySet?: Set<string>;
  changeType?: string;
  loadRequisiteDependencyOnly?: boolean;
}

export interface LoadDependentSyncablesOptions {
  loadedKeySet?: Set<string>;
  changeType?: string;
  requisiteOnly?: boolean;
}

export interface IServerGenericParams
  extends IChangePlantBlueprintGenericParams {
  syncableObject: ISyncableObject;
  viewQueryDict: object;
  customClientRPCDefinition: IRPCDefinition;
}

export type SyncableTypeToSyncableObjectsDict<
  TSyncableObject extends ISyncableObject
> = {
  [TKey in TSyncableObject['ref']['type']]?: Extract<
    TSyncableObject,
    {ref: {type: TKey}}
  >[];
};

export interface ViewQueryInfo {
  filter: ViewQueryFilter;
  query: IViewQuery;
}

export interface ServerApplyChangeResult
  extends OmitValueOfKey<ChangePlantProcessingResultWithClock, 'changes'> {
  subsequent?: Promise<ServerApplyChangeResult>[];
}

export class Server<
  TGenericParams extends IServerGenericParams
> extends EventEmitter {
  private groupToConnectionSetMap = new Map<string, Set<Connection>>();

  private changePlant: ChangePlant;

  constructor(
    /**
     * Non-user context for server-side initiated changes.
     */
    context: TGenericParams['context'],
    serverAdapter: IServerAdapter<TGenericParams>,
    syncableAdapter: ISyncableAdapter<TGenericParams>,
    blueprint: ChangePlantBlueprint<TGenericParams>,
  );
  constructor(
    private context: IContext,
    private serverAdapter: IServerAdapter,
    private syncableAdapter: ISyncableAdapter,
    blueprint: ChangePlantBlueprint,
  ) {
    super();

    if (context.type !== 'server' || context.environment !== 'server') {
      throw new Error('Invalid context');
    }

    serverAdapter.connection$.subscribe(this.onConnection);

    serverAdapter.broadcast$.subscribe(this.onBroadcast);

    this.changePlant = new ChangePlant(blueprint);
  }

  /** @internal */
  async loadSyncablesByQuery(
    group: string,
    context: IContext,
    resolvedViewQueryDict: object,
    loadedKeySet: Set<string>,
  ): Promise<ISyncable[]> {
    this.emitEvent({
      type: 'load-syncables-by-query',
      group,
      context,
      resolvedViewQueryDict,
    });

    let serverAdapter = this.serverAdapter;
    let syncableAdapter = this.syncableAdapter;

    loadedKeySet = new Set(loadedKeySet);

    let directSyncables = await serverAdapter.loadSyncablesByQuery(
      group,
      context,
      resolvedViewQueryDict,
      loadedKeySet,
    );

    directSyncables = filterReadableSyncables(
      context,
      syncableAdapter,
      directSyncables,
    );

    for (let syncable of directSyncables) {
      loadedKeySet.add(getSyncableKey(syncable));
    }

    let dependentSyncables = await this.loadDependentSyncables(
      group,
      context,
      directSyncables,
      {
        loadedKeySet,
        requisiteOnly: false,
      },
    );
    this.emitEvent({
      type: 'loaded-syncables-by-query',
      group,
      context,
      resolvedViewQueryDict,
      directSyncablesCount: directSyncables.length,
      dependentSyncablesCount: dependentSyncables.length,
    });
    return [...directSyncables, ...dependentSyncables];
  }

  /** @internal */
  async loadSyncablesByRefs(
    group: string,
    context: IContext,
    refs: SyncableRef[],
    {
      loadedKeySet,
      changeType,
      loadRequisiteDependencyOnly = false,
    }: LoadSyncablesByRefsOptions = {},
  ): Promise<ISyncable[]> {
    this.emitEvent({
      type: 'load-syncables-by-refs',
      group,
      context,
      refs,
      changeType,
    });

    let serverAdapter = this.serverAdapter;
    let syncableAdapter = this.syncableAdapter;

    loadedKeySet = new Set(loadedKeySet || []);

    if (loadedKeySet) {
      refs = refs.filter(ref => !loadedKeySet!.has(getSyncableKey(ref)));
    }

    let directSyncables = await serverAdapter.loadSyncablesByRefs(group, refs);

    directSyncables = filterReadableSyncables(
      context,
      syncableAdapter,
      directSyncables,
    );

    let dependentSyncables = await this.loadDependentSyncables(
      group,
      context,
      directSyncables,
      {
        loadedKeySet,
        changeType,
        requisiteOnly: loadRequisiteDependencyOnly,
      },
    );

    this.emitEvent({
      type: 'loaded-syncables-by-refs',
      group,
      context,
      refs,
      changeType,
      directSyncablesCount: directSyncables.length,
      dependentSyncablesCount: dependentSyncables.length,
    });

    return [...directSyncables, ...dependentSyncables];
  }

  /** @internal */
  async loadDependentSyncables(
    group: string,
    context: IContext,
    syncables: ISyncable[],
    {loadedKeySet, changeType, requisiteOnly}: LoadDependentSyncablesOptions,
  ): Promise<ISyncable[]> {
    let serverAdapter = this.serverAdapter;
    let syncableAdapter = this.syncableAdapter;

    loadedKeySet = new Set(loadedKeySet || []);

    for (let syncable of syncables) {
      loadedKeySet.add(getSyncableKey(syncable));
    }

    let loadedSyncables: ISyncable[] = [];

    let pendingResolvingSyncables = syncables;

    while (true) {
      let refs = _.uniqBy(
        _.flatMap(pendingResolvingSyncables, syncable => {
          let object = syncableAdapter.instantiateBySyncable(syncable);

          return [
            ...object.resolveRequisiteDependencyRefs(changeType),
            ...(requisiteOnly ? [] : object.resolveDependencyRefs()),
          ];
        }),
        ref => getSyncableKey(ref),
      ).filter(ref => !loadedKeySet!.has(getSyncableKey(ref)));

      if (!refs.length) {
        break;
      }

      let dependentSyncables = await serverAdapter.loadSyncablesByRefs(
        group,
        refs,
      );

      dependentSyncables = filterReadableSyncables(
        context,
        syncableAdapter,
        dependentSyncables,
      );

      for (let syncable of dependentSyncables) {
        loadedKeySet.add(getSyncableKey(syncable));
      }

      loadedSyncables.push(...dependentSyncables);

      pendingResolvingSyncables = dependentSyncables;
    }

    return loadedSyncables;
  }

  async load<TRefDict extends object>(
    group: string,
    refDict: TRefDict,
    {
      context = this.context,
      loadRequisiteDependencyOnly = true,
    }: LoadOptions = {},
  ): Promise<RefDictToSyncableObjectDict<TRefDict>> {
    this.emitEvent({
      type: 'load',
      group,
      refDict: refDict as Dict<GeneralSyncableRef>,
    });

    let container = new SyncableContainer(this.syncableAdapter);
    // TODO (vilic): Replace with GeneralSyncableRef?
    let refs = getNonCreationRefsFromRefDict(refDict as Dict<SyncableRef>);

    let syncables = await this.loadSyncablesByRefs(group, context, refs, {
      loadRequisiteDependencyOnly,
    });

    for (let syncable of syncables) {
      container.addSyncable(syncable);
    }

    return container.buildSyncableObjectDict(refDict);
  }

  async query(
    group: string,
    update: ViewQueryUpdateObject<TGenericParams['viewQueryDict']>,
  ): Promise<
    SyncableTypeToSyncableObjectsDict<TGenericParams['syncableObject']>
  >;
  async query(
    group: string,
    update: ViewQueryUpdateObject,
  ): Promise<
    SyncableTypeToSyncableObjectsDict<TGenericParams['syncableObject']>
  > {
    let container = new SyncableContainer(this.syncableAdapter);

    let {syncables} = await this._query(
      group,
      update,
      new Set(),
      container,
      this.context,
    );

    for (let syncable of syncables) {
      container.addSyncable(syncable);
    }

    return _.groupBy(
      container.getSyncableObjects(),
      syncableObject => syncableObject.ref.type,
    ) as object;
  }

  async applyChange(
    group: string,
    change: TGenericParams['change'],
    context = this.context,
  ): Promise<ServerApplyChangeResult> {
    let packet: ChangePacket = {
      id: generateUniqueId<ChangePacketId>(),
      createdAt: Date.now() as NumericTimestamp,
      ...(change as GeneralChange),
    };

    return this.applyChangePacket(group, packet, context);
  }

  /** @internal */
  async applyChangePacket(
    group: string,
    packet: ChangePacket,
    context: TGenericParams['context'],
  ): Promise<ServerApplyChangeResult> {
    this.emitEvent({
      type: 'apply-change',
      group,
      packet,
      context,
    });

    let serverAdapter = this.serverAdapter;
    let syncableAdapter = this.syncableAdapter;
    let changePlant = this.changePlant;

    let result: ChangePlantProcessingResultWithClock | undefined;

    try {
      await serverAdapter.queueChange(group, packet.id, async clock => {
        let refs = getNonCreationRefsFromRefDict(packet.refs);

        let syncables = await this.loadSyncablesByRefs(group, context, refs, {
          changeType: packet.type,
          loadRequisiteDependencyOnly: true,
        });

        let relatedRefs = changePlant.resolve(packet, syncables);

        let relatedSyncables = relatedRefs.length
          ? await this.loadSyncablesByRefs(group, context, relatedRefs, {
              changeType: packet.type,
              loadRequisiteDependencyOnly: true,
            })
          : [];

        let container = new SyncableContainer(syncableAdapter);

        for (let syncable of [...syncables, ...relatedSyncables]) {
          container.addSyncable(syncable);
        }

        result = changePlant.process(packet, context, container, clock);

        let {
          id,
          updates: updateItems,
          creations: createdSyncables,
          removals: removedSyncableRefs,
          notifications,
        } = result;

        let updatedSyncables = updateItems.map(item => item.snapshot);

        await serverAdapter.saveSyncables(
          group,
          createdSyncables,
          updatedSyncables,
          removedSyncableRefs,
        );

        let broadcastResult: BroadcastChangeResult = {
          group,
          id,
          clock,
          creations: createdSyncables,
          updates: updateItems,
          removals: removedSyncableRefs,
        };

        await serverAdapter.broadcast(broadcastResult);

        await serverAdapter.handleNotifications(group, notifications, id);
      });
    } catch (err) {
      this.emitEvent({
        type: 'apply-change-failed',
        group,
        packet,
        context,
      });

      throw err;
    }

    if (!result) {
      throw new RPCError('CHANGE_NOT_APPLIED');
    }

    this.emitEvent({
      type: 'applied-change',
      group,
      packet,
      context,
      result,
    });

    let {changes: subsequentChanges, ...rest} = result;

    return {
      subsequent: subsequentChanges.length
        ? subsequentChanges.map(change =>
            this.applyChange(group, change, context),
          )
        : undefined,
      ...rest,
    };
  }

  /** @internal */
  async _query(
    group: string,
    update: ViewQueryUpdateObject,
    loadedKeySet: Set<string>,
    container: SyncableContainer,
    context: TGenericParams['context'],
  ): Promise<{
    syncables: ISyncable[];
    nameToViewQueryMapToAdd: Map<string, ViewQueryInfo>;
    viewQueryNamesToRemove: string[];
  }> {
    let syncableAdapter = this.syncableAdapter;

    let queryEntries = Object.entries(update);

    let refs = _.uniqBy<SyncableRef>(
      _.flatMapDeep(queryEntries, ([, query]) =>
        query ? Object.values(query.refs) : [],
      ),
      ref => getSyncableKey(ref),
    ).filter(ref => !container.existsSyncable(ref));

    if (refs.length) {
      let syncables = await this.loadSyncablesByRefs(group, context, refs, {
        loadRequisiteDependencyOnly: true,
      });

      for (let syncable of syncables) {
        container.addSyncable(syncable);
      }
    }

    let nameToViewQueryMapToAdd = new Map<string, ViewQueryInfo>();
    let viewQueryNamesToRemove = [];

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

        nameToViewQueryMapToAdd.set(name, {
          filter,
          query,
        });

        resolvedViewQueryDict[name] = resolvedViewQuery;
      } else {
        viewQueryNamesToRemove.push(name);
      }
    }

    let syncables = await this.loadSyncablesByQuery(
      group,
      context,
      resolvedViewQueryDict,
      loadedKeySet,
    );

    return {
      syncables,
      nameToViewQueryMapToAdd,
      viewQueryNamesToRemove,
    };
  }

  protected emitEvent(data: SyncableEvent): void {
    this.emit('event', data);
  }

  private onConnection = (connection: Connection): void => {
    this.addConnection(connection).catch(console.error);
  };

  private onBroadcast = (result: BroadcastChangeResult): void => {
    this.broadcastChangeResult(result);
  };

  private async addConnection(connection: Connection): Promise<void> {
    let group = connection.group;

    let groupToConnectionSetMap = this.groupToConnectionSetMap;
    let connectionSet = groupToConnectionSetMap.get(group);

    connection.close$.subscribe({
      error: error => {
        console.error(error);
        this.removeConnection(connection).catch(console.error);
      },
      complete: () => {
        this.removeConnection(connection).catch(console.error);
      },
    });

    if (connectionSet) {
      connectionSet.add(connection);
    } else {
      connectionSet = new Set([connection]);
      groupToConnectionSetMap.set(group, connectionSet);

      await this.serverAdapter.subscribe(group);
    }
  }

  private async removeConnection(connection: Connection): Promise<void> {
    let group = connection.group;

    let groupToConnectionSetMap = this.groupToConnectionSetMap;
    let connectionSet = groupToConnectionSetMap.get(group);

    if (!connectionSet) {
      return;
    }

    connectionSet.delete(connection);

    if (!connectionSet.size) {
      groupToConnectionSetMap.delete(group);

      await this.serverAdapter.unsubscribe(group);
    }

    connection.dispose();
  }

  private broadcastChangeResult(result: BroadcastChangeResult): void {
    let {group} = result;

    let connectionSet = this.groupToConnectionSetMap.get(group);

    if (!connectionSet) {
      return;
    }

    for (let connection of connectionSet) {
      connection.handleBroadcastChangeResult(result);
    }
  }
}

export interface LoadEvent {
  type: 'load';
  group: string;
  refDict: Dict<GeneralSyncableRef>;
}

export interface LoadSyncablesByQueryEvent {
  type: 'load-syncables-by-query';
  group: string;
  context: IContext;
  resolvedViewQueryDict: object;
}

export interface LoadedSyncablesByQueryEvent {
  type: 'loaded-syncables-by-query';
  group: string;
  context: IContext;
  resolvedViewQueryDict: object;
  directSyncablesCount: number;
  dependentSyncablesCount: number;
}

export interface LoadSyncablesByRefsEvent {
  type: 'load-syncables-by-refs';
  group: string;
  context: IContext;
  refs: SyncableRef[];
  changeType: string | undefined;
}

export interface LoadedSyncablesByRefsEvent {
  type: 'loaded-syncables-by-refs';
  group: string;
  context: IContext;
  refs: SyncableRef[];
  changeType: string | undefined;
  directSyncablesCount: number;
  dependentSyncablesCount: number;
}

export interface ApplyChangeEvent {
  type: 'apply-change';
  group: string;
  packet: ChangePacket;
  context: IContext;
}

export interface AppliedChangeEvent {
  type: 'applied-change';
  group: string;
  packet: ChangePacket;
  context: IContext;
  result: ChangePlantProcessingResultWithClock;
}

export interface ApplyChangeFailedEvent {
  type: 'apply-change-failed';
  group: string;
  packet: ChangePacket;
  context: IContext;
}

export type SyncableEvent =
  | LoadEvent
  | LoadSyncablesByQueryEvent
  | LoadedSyncablesByQueryEvent
  | LoadSyncablesByRefsEvent
  | LoadedSyncablesByRefsEvent
  | ApplyChangeEvent
  | AppliedChangeEvent
  | ApplyChangeFailedEvent;
