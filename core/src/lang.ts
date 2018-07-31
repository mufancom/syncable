// tslint:disable:class-name
// tslint:disable:variable-name

export interface Dict<T> {
  [key: string]: T;
}

export type StringType<T> = string & __Type<T>;

export declare class __Type<T> {
  private __type: T;
}

//////////////////
// Type Utility //
//////////////////

export type FilterType<T, TFilter, TFallback = never> = T extends TFilter
  ? T
  : TFallback;

export type ExcludeProperty<T extends object, K> = T extends object
  ? Pick<T, Exclude<keyof T, K>>
  : never;

export type ExtractProperty<T extends object, K> = T extends object
  ? Pick<T, Extract<keyof T, K>>
  : never;

export type KeyOf<T extends object, Type extends any> = Extract<keyof T, Type>;

export type Constructor<T extends object = object> = new (...args: any[]) => T;
