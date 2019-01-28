import {IClientAdapter} from '@syncable/client';
import {RPCData} from '@syncable/core';
import {Observable, Subject, from} from 'rxjs';
import {delayWhen, share} from 'rxjs/operators';

import {randomNap} from './@utils';
import {ClientGenericParams} from './client';
import {Context} from './context';
import {UserId} from './syncables';

export class ClientAdapter implements IClientAdapter<ClientGenericParams> {
  incoming$: Observable<RPCData>;

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

    this.context = new Context('user', 'client', userId);
  }

  async send(data: RPCData): Promise<void> {
    this.outgoing$.next(data);

    await randomNap();
  }

  handleNotifications(): void {}
}
