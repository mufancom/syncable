import { EventEmitter } from 'events';

import { Change } from 'syncable';

import { Server } from './server';

export interface QueuedChange extends Change {
  timestamp: number;
}

export abstract class ChangeQueue extends EventEmitter {
  constructor(
    private server: Server,
  ) {
    super();
  }

  abstract async generateTimestamp(): Promise<number>;
  abstract async addChangeToQueue(change: QueuedChange): Promise<void>;

  async push(change: Change): Promise<void> {
    let queuedChange: QueuedChange = Object.assign({}, change);

    this.server.mergeChange(change);

  }


}

export interface ChangeQueue {
  on(type: 'change', listener: (change: QueuedChange) => void): this;
}
