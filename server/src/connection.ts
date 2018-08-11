import {IncomingMessage} from 'http';

import {
  ChangePacket,
  ConsequentSeries,
  Context,
  SnapshotEventData,
  Syncable,
  SyncableId,
  SyncableRef,
  UserSyncableObject,
  getSyncableRef,
} from '@syncable/core';

import {Server, ViewQueryFilter} from './server';

export interface ConnectionSocket extends SocketIO.Socket {
  on(event: 'query', listener: (query: unknown) => void): this;
  on(event: 'change', listener: (packet: ChangePacket) => void): this;

  emit(event: 'snapshot', snapshot: SnapshotEventData): boolean;
  emit(event: 'consequent-series', series: ConsequentSeries): boolean;
}

export class Connection {
  private context!: Context;
  private snapshotIdSet = new Set<SyncableId>();

  constructor(private socket: ConnectionSocket, private server: Server) {}

  async initialize(userRef: SyncableRef<UserSyncableObject>): Promise<void> {
    let socket = this.socket;
    let manager = this.server.manager;

    let request = socket.request as IncomingMessage;

    socket.on('change', packet => {}).on('query', query => {
      this.onQuery(query);
    });

    let user = manager.requireSyncableObject(userRef);

    this.context = new Context(user);

    let syncables = this.snapshot([userRef]);

    socket.emit('snapshot', {
      userRef,
      syncables,
    });
  }

  snapshot(refs?: SyncableRef[]): Syncable[] {
    let manager = this.server.manager;
    let context = this.context;

    let filter = this.filter;
    let snapshotIdSet = this.snapshotIdSet;

    let entranceRequisite: boolean;
    let entranceSyncables: Syncable[];

    if (refs) {
      entranceRequisite = true;
      entranceSyncables = refs.map(ref => manager.requireSyncable(ref));
    } else {
      entranceRequisite = false;
      entranceSyncables = manager.syncables;
    }

    let result: Syncable[] = [];

    for (let syncable of entranceSyncables) {
      ensureAssociationsAndSnapshot(syncable, entranceRequisite);
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

      console.log(
        !requisite && filter && !filter(object),
        !object.testAccessRights(['read'], {}, context),
      );

      if (
        (!requisite && filter && !filter(object)) ||
        !object.testAccessRights(['read'], {}, context)
      ) {
        return;
      }

      if (associations) {
        for (let {requisite, ref} of associations) {
          if (snapshotIdSet.has(ref.id)) {
            continue;
          }

          let associatedSyncable = manager.requireSyncable(ref);

          ensureAssociationsAndSnapshot(associatedSyncable, requisite);
        }
      }

      snapshotIdSet.add(id);

      result.push(syncable);
    }
  }

  private filter: ViewQueryFilter = () => false;

  private onQuery(query: unknown): void {
    this.filter = this.server.getViewQueryFilter(query);
  }
}
