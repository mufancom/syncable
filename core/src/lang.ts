// tslint:disable:class-name
// tslint:disable:variable-name

export interface Dict<T> {
  [key: string]: T;
}

export type StringType<T, U = never> = string & __Type<[T, U]>;

export declare class __Type<T> {
  private __type: T;
}

//////////////////
// Type Utility //
//////////////////

export type ExcludeProperty<T extends object, K> = T extends object
  ? Pick<T, Exclude<keyof T, K>>
  : never;

export type Constructor<T extends object> = new (...args: any[]) => T;
