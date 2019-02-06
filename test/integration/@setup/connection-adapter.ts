import {RPCData, SyncableRef} from '@syncable/core';
import {IConnectionAdapter} from '@syncable/server';
import {Observable, Subject, from} from 'rxjs';
import {delayWhen, share} from 'rxjs/operators';

import {randomNap} from './@utils';
import {Context} from './context';
import {ServerGenericParams} from './server';
import {User} from './syncables';
import {ViewQuery} from './view-query';

export class ConnectionAdapter
  implements IConnectionAdapter<ServerGenericParams> {
  incoming$: Observable<RPCData>;

  readonly viewQuery: Partial<ViewQuery> = {
    default: {
      refs: {},
      options: {},
    },
  };

  readonly context: Context;

  constructor(
    readonly group: string,
    userRef: SyncableRef<User>,
    private incomingSource$: Subject<RPCData>,
    private outgoing$: Subject<RPCData>,
  ) {
    this.incoming$ = incomingSource$.pipe(
      delayWhen(() => from(randomNap())),
      share(),
    );

    this.context = new Context('user', 'server', userRef);
  }

  async send(data: RPCData): Promise<void> {
    this.outgoing$.next(data);

    await randomNap();
  }

  close(): void {
    this.outgoing$.complete();
    this.incomingSource$.complete();
  }
}
