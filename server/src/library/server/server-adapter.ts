import {Observable} from 'rxjs';

import {IConnectionSource} from '../connection';

export type QueuedChangeProcessor = () => Promise<void>;

export interface IServerAdapter {
  connectionSource$: Observable<IConnectionSource>;

  queueChange(group: string, processor: QueuedChangeProcessor): Promise<void>;
}
