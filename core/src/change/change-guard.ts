import {Context} from '../context';
import {AccessControlChange} from './access-control-changes';
import {Change} from './change';

export type GuardedChangeHandler<T extends Change> = (change: T) => void;

export class ChangeGuard<T extends Change> {
  constructor(private handler: GuardedChangeHandler<T | AccessControlChange>) {}

  push(change: T | AccessControlChange, context: Context): void {
    this.handler(change);
  }
}
