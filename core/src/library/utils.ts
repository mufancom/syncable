import uuid from 'uuid';

export function generateUniqueId<T extends string>(): T {
  return uuid() as T;
}
