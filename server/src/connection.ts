import {IncomingMessage} from 'http';

import {
  ChangePacket,
  ConsequentSeries,
  Context,
  SnapshotEventData,
  Syncable,
  SyncableId,
  SyncableManager,
  SyncableRef,
  UserSyncableObject,
  getSyncableRef,
} from '@syncable/core';
import _ from 'lodash';

import {Server, ViewQueryFilter} from './server';

export interface ConnectionSocket extends SocketIO.Socket {
  on(event: 'view-query', listener: (query: unknown) => void): this;
  on(event: 'change', listener: (packet: ChangePacket) => void): this;

  emit(event: 'snapshot', snapshot: SnapshotEventData): boolean;
  emit(event: 'consequent-series', series: ConsequentSeries): boolean;
}

export class Connection {
  private context!: Context;
  private snapshotIdSet = new Set<SyncableId>();

  constructor(
    private socket: ConnectionSocket,
    private server: Server,
    private manager: SyncableManager,
  ) {}

  async initialize(
    userRef: SyncableRef<UserSyncableObject>,
    viewQuery: unknown,
  ): Promise<void> {
    let socket = this.socket;
    let manager = this.manager;

    let request = socket.request as IncomingMessage;

    socket
      .on('change', packet => {
        console.log(packet);
        this.update(packet);
      })
      .on('view-query', query => {
        this.updateViewQuery(query);
      });

    let user = manager.requireSyncableObject(userRef);

    this.context = new Context(user);

    this.updateViewQuery(viewQuery);

    let syncables = this.snapshot(userRef);

    socket.emit('snapshot', {
      userRef,
      syncables,
    });
  }

  snapshot(userRef?: SyncableRef<UserSyncableObject>): Syncable[] {
    let manager = this.manager;
    let context = this.context;

    let filter = this.filter;
    let snapshotIdSet = this.snapshotIdSet;

    let result: Syncable[] = [];

    if (userRef) {
      let userSyncable = manager.requireSyncable(userRef);
      ensureAssociationsAndSnapshot(userSyncable, true);
    }

    for (let syncable of manager.syncables) {
      ensureAssociationsAndSnapshot(syncable, false);
    }

    return result;

    function ensureAssociationsAndSnapshot(
      syncable: Syncable,
      requisite: boolean,
    ): void {
      let {_id: id, _associations: associations} = syncable;

      if (snapshotIdSet.has(id)) {
        return;
      }

      let ref = getSyncableRef(syncable);
      let object = manager.requireSyncableObject(ref);

      if (
        (!requisite && filter && !filter(object)) ||
        !object.testAccessRights(['read'], context, {})
      ) {
        return;
      }

      if (associations) {
        for (let {requisite, ref} of associations) {
          if (snapshotIdSet.has(ref.id)) {
            continue;
          }

          let associatedSyncable = manager.requireSyncable(ref);

          ensureAssociationsAndSnapshot(associatedSyncable, !!requisite);
        }
      }

      snapshotIdSet.add(id);

      result.push(syncable);
    }
  }

  private filter: ViewQueryFilter = () => false;

  private update(packet: ChangePacket): void {
    this.applyChangePacket(packet);
  }

  private updateViewQuery(query: unknown): void {
    this.filter = this.server.getViewQueryFilter(query);
  }

  private applyChangePacket(packet: ChangePacket): void {
    let manager = this.manager;

    let refDict = packet.refs;

    let syncableObjectDict = _.mapValues(refDict, ref =>
      manager.requireSyncableObject(ref),
    );

    let {
      updates: updateDict,
      creations,
      removals,
    } = this.server.changePlant.process(
      packet,
      syncableObjectDict,
      this.context,
    );

    for (let {snapshot} of Object.values(updateDict)) {
      manager.updateSyncable(snapshot);
    }

    for (let ref of removals) {
      manager.removeSyncable(ref);
    }

    for (let syncable of creations) {
      manager.addSyncable(syncable);
    }
  }
}
