import {Dict} from '../lang';

export function convertDictToMap<T>(dict: Dict<T>): Map<string, T> {
  let entries = Object.keys(dict).map((key): [string, T] => [key, dict[key]]);
  return new Map(entries);
}
