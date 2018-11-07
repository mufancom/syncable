export function isTruthy<T>(object: T | undefined): object is T {
  return !!object;
}
