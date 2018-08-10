import {IncomingMessage} from 'http';

import {
  ChangePacket,
  ChangePlant,
  ConsequentSeries,
  GeneralChange,
  SnapshotEventData,
  SyncableRef,
  UserSyncableObject,
} from '@syncable/core';
import {ServerContext} from './server-context';

export interface ConnectionSocket extends SocketIO.Socket {
  on(event: 'query', listener: (query: any) => void): this;
  on(event: 'change', listener: (packet: ChangePacket) => void): this;

  emit(event: 'snapshot', snapshot: SnapshotEventData): boolean;
  emit(event: 'consequent-series', series: ConsequentSeries): boolean;
}

export class Connection {
  constructor(
    private socket: ConnectionSocket,
    private context: ServerContext,
    private changePlant: ChangePlant<GeneralChange>,
  ) {}

  async initialize(): Promise<void> {
    let socket = this.socket;
    let context = this.context;

    let request = socket.request as IncomingMessage;
    let userRef: SyncableRef<UserSyncableObject> = {
      type: 'user',
      id: '5b6c39265f5489de6093a392',
    };

    socket.on('change', packet => {}).on('query', query => {});

    let syncables = await context.initialize(userRef, {}, {});

    socket.emit('snapshot', {
      userRef,
      syncables,
    });
  }

  private onQuery(query: any): void {
    this.updateQuery(query).catch(error => {
      this.socket.disconnect();
      console.error(error);
    });
  }

  private async updateQuery(query: any): Promise<void> {}
}
