import {
  ChangePacket,
  ChangePacketId,
  ChangePlant,
  ChangePlantBlueprint,
  ChangePlantBlueprintGenericParams,
  ChangePlantProcessingResultWithClock,
  GeneralChange,
  IContext,
  IRPCDefinition,
  ISyncableAdapter,
  NumericTimestamp,
  RPCFunctionDict,
  ServerConnectionRPCDefinition,
  SyncableContainer,
  generateUniqueId,
} from '@syncable/core';

import {
  Connection,
  IConnectionSource,
  connectionRPCFunctionDict,
} from '../connection';

import {BroadcastChangeResult, IServerAdapter} from './server-adapter';

export interface ServerGenericParams extends ChangePlantBlueprintGenericParams {
  customRPCDefinition: IRPCDefinition;
}

export class Server<TGenericParams extends ServerGenericParams> {
  private connectionSet = new Set<Connection<TGenericParams>>();

  private changePlant: ChangePlant;

  private extendedConnectionRPCFunctionDict: RPCFunctionDict<
    Connection<TGenericParams>,
    ServerConnectionRPCDefinition | TGenericParams['customRPCDefinition']
  >;

  constructor(
    private context: IContext,
    private serverAdapter: IServerAdapter,
    private syncableAdapter: ISyncableAdapter,
    blueprint: ChangePlantBlueprint<TGenericParams>,
    customRPCFunctionDict: RPCFunctionDict<
      Connection<TGenericParams>,
      TGenericParams['customRPCDefinition']
    >,
  ) {
    if (context.type !== 'server' || context.environment !== 'server') {
      throw new Error('Invalid context');
    }

    serverAdapter.connectionSource$.subscribe(this.onConnectionSource);

    this.changePlant = new ChangePlant(blueprint, syncableAdapter);

    this.extendedConnectionRPCFunctionDict = {
      ...connectionRPCFunctionDict,
      ...customRPCFunctionDict,
    };
  }

  async update(
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
      let container = new SyncableContainer(syncableAdapter);

      let syncables = await changePlant.resolve(packet, refs =>
        serverAdapter.loadSyncablesByRefs(group, refs),
      );

      for (let syncable of syncables) {
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
        id,
        creations: createdSyncables,
        updates: updateItems,
        removals: removedSyncableRefs,
      };

      await serverAdapter.broadcast(group, broadcastResult);

      await serverAdapter.handleNotifications(group, notifications);
    });

    return result;
  }

  private onConnectionSource = (source: IConnectionSource): void => {
    let context = source.context;

    if (context.type !== 'user' || context.environment !== 'server') {
      throw new Error('Invalid context');
    }

    let connection = new Connection(
      this,
      source,
      this.extendedConnectionRPCFunctionDict,
    );

    this.connectionSet.add(connection);
  };
}
