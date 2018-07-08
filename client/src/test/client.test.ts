// tslint:disable:no-implicit-dependencies
import {
  AccessControlRuleSet,
  Change,
  Permission,
  Resource,
  Syncable,
} from '@syncable/core';
import * as SocketIO from 'socket.io-client';

import {ClientChangePlant} from '../change-plant';
import {Client} from '../client';
import {ClientContext} from '../context';

export interface SnapshotsData {
  syncables: Syncable[];
}

export interface TestSocket extends SocketIOClient.Socket {
  on(event: 'reconnect', listener: (attempt: number) => void): this;
  on(event: 'change', listener: (change: Change) => void): this;
  on(event: 'snapshots', listener: (syncables: Syncable[]) => void): this;

  emit(event: 'subscribe', subscription: Subscription): this;
  emit(event: 'change', change: Change | ServerCreation): this;
  emit(event: 'request', request: Request): this;
}

const acRuleSet = new AccessControlRuleSet({});

export class TestClientChangePlant extends ClientChangePlant {}

export class TestClientContext extends ClientContext {
  protected user: Resource | undefined;
  protected permissions: Permission[] | undefined;
}

export class TestClient extends Client {
  context: ClientContext;
  changePlant: ClientChangePlant;

  private io!: TestSocket;

  constructor(private url: string) {
    super();

    this.context = new TestClientContext(acRuleSet);
    this.changePlant = new TestClientChangePlant(this.context);
  }

  initSocket(): void {
    let io = (this.io = SocketIO(this.url, {
      transports: ['websocket'],
    }) as TestSocket);

    io.on('change', change => this.onChange(change));
    io.on('snapshots', snapshots => this.onSnapshots(snapshots));
  }
}
