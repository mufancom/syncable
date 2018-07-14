export interface Change<
  Type extends string = string,
  RefDict extends object = object,
  Options extends object = object
> {
  type: Type;
  refs: RefDict;
  options: Options;
}
