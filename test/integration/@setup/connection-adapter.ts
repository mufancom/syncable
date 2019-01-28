import {RPCData} from '@syncable/core';
import {IConnectionAdapter} from '@syncable/server';
import {Observable, Subject, from} from 'rxjs';
import {delayWhen, share} from 'rxjs/operators';

import {randomNap} from './@utils';
import {Context} from './context';
import {ServerGenericParams} from './server';
import {UserId} from './syncables';
import {ViewQuery} from './view-query';

export class ConnectionAdapter
  implements IConnectionAdapter<ServerGenericParams> {
  incoming$: Observable<RPCData>;

  readonly viewQuery: Partial<ViewQuery> = {default: {}};

  readonly context: Context;

  constructor(
    readonly group: string,
    userId: UserId,
    incomingSource$: Observable<RPCData>,
    private outgoing$: Subject<RPCData>,
  ) {
    this.incoming$ = incomingSource$.pipe(
      delayWhen(() => from(randomNap())),
      share(),
    );

    this.context = new Context('user', 'server', userId);
  }

  async send(data: RPCData): Promise<void> {
    this.outgoing$.next(data);

    await randomNap();
  }
}
