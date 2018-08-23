// tslint:disable:class-name
// tslint:disable:variable-name

export type Primitive = undefined | null | boolean | string | number;

export interface Dict<T> {
  [key: string]: T;
}

export declare class __Type<T> {
  private __type: T;
}

export type StringType<T> = string & __Type<T>;

export type __DeepReadonly<T> = {readonly [P in keyof T]: DeepReadonly<T[P]>};

export type DeepReadonly<T> = T extends Primitive
  ? T
  : T extends (infer U)[]
    ? ReadonlyArray<__DeepReadonly<U>>
    : __DeepReadonly<T>;

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

export type KeyOf<T extends object, Type = any> = Extract<keyof T, Type>;

export type KeyOfType<T extends object, Type = any> = {
  [K in keyof T]: T[K] extends Type ? K : never
}[keyof T];

export type ValueOfType<T extends object, Type = any> = {
  [K in keyof T]: T[K] extends Type ? T[K] : never
}[keyof T];

export type Constructor<T extends object = object> = new (...args: any[]) => T;
