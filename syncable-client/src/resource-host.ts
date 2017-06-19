export type Resolvable<T> = PromiseLike<T> | T;

export abstract class ResourceHost {
  abstract create(subject: string, uid: string, object: object): Resolvable<void>;
  abstract update(subject: string, uid: string, object: object): Resolvable<void>;
  abstract remove(subject: string, uid: string): Resolvable<void>;
}
