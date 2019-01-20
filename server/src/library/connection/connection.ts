import {RPCPeer} from '@syncable/core';
import {Subscription} from 'rxjs';

import {IConnectionSource} from './connection-source';

export class Connection extends RPCPeer<never, never> {
  private subscription = new Subscription();

  constructor(source: IConnectionSource, functionDict: object) {
    super(source, functionDict);
  }

  dispose(): void {
    this.subscription.unsubscribe();
  }
}
