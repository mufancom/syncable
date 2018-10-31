import {ObjectReplacer} from 'replace-object';

class NonDeleteObjectReplacer extends ObjectReplacer {
  protected delete(object: any, key: string): void {
    object[key] = undefined;
  }
}

const nonDeleteObjectReplacer = new NonDeleteObjectReplacer();

export function replaceObjectWithoutDeletion<T extends object>(
  object: T,
  withObject: T,
): void {
  nonDeleteObjectReplacer.replace(object, withObject);
}

export function isTruthy<T>(object: T | undefined): object is T {
  return !!object;
}
