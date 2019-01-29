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
  NumericTimestamp,
  SyncableContainer,
  SyncableRef,
  generateUniqueId,
  getSyncableKey,
} from '@syncable/core';
import _ from 'lodash';

import {filterReadableSyncables} from '../@utils';
import {Connection} from '../connection';
import {ViewQueryFilter} from '../view-query';

import {BroadcastChangeResult, IServerAdapter} from './server-adapter';

export interface IServerGenericParams
  extends IChangePlantBlueprintGenericParams {
  syncableObject: ISyncableObject;
  viewQuery: object;
  customRPCDefinition: IRPCDefinition;
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
  getViewQueryFilter(name: string, query: object): ViewQueryFilter {
    return this.serverAdapter.getViewQueryFilter(name, query);
  }

  async loadSyncablesByQuery(
    group: string,
    context: IContext,
    queryObject: object,
    loadedKeySet: Set<string>,
  ): Promise<ISyncable[]> {
    let serverAdapter = this.serverAdapter;
    let syncableAdapter = this.syncableAdapter;

    let directSyncables = await serverAdapter.loadSyncablesByQuery(
      group,
      context,
      queryObject,
      loadedKeySet,
    );

    directSyncables = filterReadableSyncables(
      context,
      syncableAdapter,
      directSyncables,
    );

    let dependentSyncables = await this.loadDependentSyncables(
      group,
      context,
      directSyncables,
      loadedKeySet,
      undefined,
    );

    return [...directSyncables, ...dependentSyncables];
  }

  async loadSyncablesByRefs(
    group: string,
    context: IContext,
    refs: SyncableRef[],
    loadedKeySet: Set<string>,
  ): Promise<ISyncable[]> {
    let serverAdapter = this.serverAdapter;
    let syncableAdapter = this.syncableAdapter;

    refs = refs.filter(ref => !loadedKeySet.has(getSyncableKey(ref)));

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
      loadedKeySet,
      undefined,
    );

    return [...directSyncables, ...dependentSyncables];
  }

  async applyChange(
    group: string,
    change: TGenericParams['change'],
  ): Promise<ChangePlantProcessingResultWithClock> {
    let packet: ChangePacket = {
      id: generateUniqueId<ChangePacketId>(),
      createdAt: Date.now() as NumericTimestamp,
      ...(change as GeneralChange),
    };

    return this.applyChangePacket(group, packet, this.context);
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
      let refs = Object.values(packet.refs).filter(
        (ref): ref is SyncableRef => !!ref && 'id' in ref,
      );

      let options = changePlant.getDependencyOptions(packet.type);

      let directSyncables = await serverAdapter.loadSyncablesByRefs(
        group,
        refs,
      );

      let dependentSyncables = await this.loadDependentSyncables(
        group,
        context,
        directSyncables,
        undefined,
        options,
      );

      let container = new SyncableContainer(syncableAdapter);

      for (let syncable of [...directSyncables, ...dependentSyncables]) {
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

  private onConnection = (connection: Connection<TGenericParams>): void => {
    this.addConnection(connection).catch();
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

    connection.close$.subscribe(
      undefined,
      error => {
        console.error(error);
        this.removeConnection(connection).catch(console.error);
      },
      () => {
        this.removeConnection(connection).catch(console.error);
      },
    );

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

  private async loadDependentSyncables(
    group: string,
    context: IContext,
    syncables: ISyncable[],
    loadedKeySet: Set<string> | undefined,
    options: unknown | undefined,
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
      let refs = _.flatMap(pendingResolvingSyncables, syncable =>
        syncableAdapter.resolveDependencyRefs(syncable, options),
      ).filter(ref => {
        let key = getSyncableKey(ref);

        if (loadedKeySet!.has(key)) {
          return false;
        } else {
          loadedKeySet!.add(key);
          return true;
        }
      });

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

      loadedSyncables.push(...dependentSyncables);

      pendingResolvingSyncables = dependentSyncables;
    }

    return loadedSyncables;
  }
}