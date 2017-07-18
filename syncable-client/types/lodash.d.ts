declare module 'lodash.isequal' {
  function isEqual(a: any, b: any): boolean;

  namespace isEqual { }

  export = isEqual;
}

declare module 'lodash.difference' {
  function difference<T>(a: T[], b: T[]): T[];

  namespace difference { }

  export = difference;
}
