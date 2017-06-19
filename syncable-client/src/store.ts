export interface Store<T> {
  getItem(): Promise<T>;
  setItem(key: string, value: T): Promise<void>;
  iterate<U = undefined>(callback: (value: T, key: string) => U | void): Promise<U>;
}
