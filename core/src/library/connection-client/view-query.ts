export type ViewQueryUpdateObject<TViewQueryObject extends object> = {
  [TName in keyof TViewQueryObject]?: TViewQueryObject[TName] | false
};
