import {isObservable} from 'mobx';

export function assertNonObservable(object: any): void {
  if (isObservable(object)) {
    throw new TypeError('Expecting a non-observable');
  }
}
