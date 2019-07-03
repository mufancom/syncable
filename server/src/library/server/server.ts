import {
  ChangePacket,
  ChangePacketId,
  ChangePlant,
  ChangePlantBlueprint,
  ChangePlantProcessingResultWithClock,
  GeneralChange,
  IChangePlantBlueprintGenericParams,
  IContext,
  IRPCDefinition,
  ISyncable,
  ISyncableAdapter,
  ISyncableObject,
  IViewQuery,
  NumericTimestamp,
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
import {Dict} from 'tslang';

import {filterReadableSyncablesAndSanitize} from '../@utils';
import {Connection} from '../connection';

import {BroadcastChangeResult, IServerAdapter} from './server-adapter';

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
  >[]
};

export interface ViewQueryInfo {
  filter: ViewQueryFilter;
  query: IViewQuery;
}

export class Server<TGenericParams extends IServerGenericParams> {
  private groupToConnectionSetMap = new Map<
    string,
    Set<Connection<TGenericParams>>
  >();

  private changePlant: ChangePlant;

  constructor(
    /**
     * Non-user context for server-side initiated changes.
     */
    private context: TGenericParams['context'],
    private serverAdapter: IServerAdapter<TGenericParams>,
    private syncableAdapter: ISyncableAdapter<TGenericParams>,
    blueprint: ChangePlantBlueprint<TGenericParams>,
  ) {
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
    let serverAdapter = this.serverAdapter;
    let syncableAdapter = this.syncableAdapter;

    loadedKeySet = new Set(loadedKeySet);

    let directSyncables = await serverAdapter.loadSyncablesByQuery(
      group,
      context,
      resolvedViewQueryDict,
      loadedKeySet,
    );

    directSyncables = filterReadableSyncablesAndSanitize(
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
    }: LoadSyncablesByRefsOptions,
  ): Promise<ISyncable[]> {
    let serverAdapter = this.serverAdapter;
    let syncableAdapter = this.syncableAdapter;

    loadedKeySet = new Set(loadedKeySet || []);

    if (loadedKeySet) {
      refs = refs.filter(ref => !loadedKeySet!.has(getSyncableKey(ref)));
    }

    let directSyncables = await serverAdapter.loadSyncablesByRefs(group, refs);

    directSyncables = filterReadableSyncablesAndSanitize(
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
          let object = syncableAdapter.instantiate(syncable);

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

      dependentSyncables = filterReadableSyncablesAndSanitize(
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
  ): Promise<RefDictToSyncableObjectDict<TRefDict>> {
    let container = new SyncableContainer(this.syncableAdapter);
    let refs = getNonCreationRefsFromRefDict(refDict as Dict<SyncableRef>);

    let syncables = await this.loadSyncablesByRefs(group, this.context, refs, {
      loadRequisiteDependencyOnly: true,
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
  ): Promise<ChangePlantProcessingResultWithClock> {
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
  ): Promise<ChangePlantProcessingResultWithClock> {
    let serverAdapter = this.serverAdapter;
    let syncableAdapter = this.syncableAdapter;
    let changePlant = this.changePlant;

    let result!: ChangePlantProcessingResultWithClock;

    await serverAdapter.queueChange(group, async clock => {
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

    return result;
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
    nameToViewQueryMapToRemove: string[];
  }> {
    let syncableAdapter = this.syncableAdapter;

    let queryEntries = Object.entries(update);

    let refs = _.uniqBy(
      _.flatMap(queryEntries, ([, query]) =>
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
    let nameToViewQueryMapToRemove = [];

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
        nameToViewQueryMapToRemove.push(name);
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
      nameToViewQueryMapToRemove,
    };
  }

  private onConnection = (connection: Connection<TGenericParams>): void => {
    this.addConnection(connection).catch(console.error);
  };

  private onBroadcast = (result: BroadcastChangeResult): void => {
    this.broadcastChangeResult(result);
  };

  private async addConnection(
    connection: Connection<TGenericParams>,
  ): Promise<void> {
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

    await connection.initialize();
  }

  private async removeConnection(
    connection: Connection<TGenericParams>,
  ): Promise<void> {
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
