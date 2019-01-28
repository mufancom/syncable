import {IRPCAdapter, RPCData} from '@syncable/core';
import {Observable, Subject} from 'rxjs';

export class RPCAdapter implements IRPCAdapter {
  constructor(
    readonly incoming$: Observable<RPCData>,
    private outgoing$: Subject<RPCData>,
  ) {}

  async send(outgoing: RPCData): Promise<void> {
    this.outgoing$.next(outgoing);
  }
}

export function createAdapterPair(): [RPCAdapter, RPCAdapter] {
  let this$ = new Subject<RPCData>();
  let that$ = new Subject<RPCData>();

  return [new RPCAdapter(this$, that$), new RPCAdapter(that$, this$)];
}
