const _hasOwnProperty = Object.prototype.hasOwnProperty;

export function hasOwnProperty(
  object: object,
  name: string | number | symbol,
): boolean {
  return _hasOwnProperty.call(object, name);
}
