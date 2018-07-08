import {
  Change,
  ConsequentSeries,
  ResourceRef,
  Syncable,
  ViewQuery,
} from '@syncable/core';

import {ClientChangePlant} from './change-plant';
import {ClientContext} from './context';

export interface SnapshotsData {
  snapshots: Syncable[];
}

export interface TestSocket extends SocketIOClient.Socket {
  on(event: 'reconnect', listener: (attempt: number) => void): this;
  on(
    event: 'consequent-series',
    listener: (series: ConsequentSeries) => void,
  ): this;
  on(event: 'snapshots', listener: (syncables: Syncable[]) => void): this;

  emit(event: 'update', update: ClientUpdate): this;
  emit(event: 'request', request: Request): this;
}

export class Client<
  Context extends ClientContext,
  ChangePlant extends ClientChangePlant
> {
  viewQuery: ViewQuery | undefined;

  constructor(readonly context: Context, readonly changePlant: ChangePlant) {}

  protected onSnapshots(syncables: Syncable[], userRef?: ResourceRef): void {
    for (let syncable of syncables) {
      this.context.addSyncableToCache(syncable);
    }

    if (userRef) {
      this.context.setUser(userRef);
    }
  }

  protected onChange(change: Change): void {
    this.changePlant.apply(change);
  }
}
