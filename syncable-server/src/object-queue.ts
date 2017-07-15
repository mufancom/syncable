export type ObjectQueueHandler<T> = (object: T) => void;
export type ObjectQueueFilter<T> = (object: T) => boolean;

export class ObjectQueue<T> {
  private pending: T[] | undefined;

  constructor(
    private handler: ObjectQueueHandler<T>,
  ) { }

  add(object: T): void {
    if (this.pending) {
      this.pending.push(object);
    } else {
      this.handler(object);
    }
  }

  pause(): void {
    if (!this.pending) {
      this.pending = [];
    }
  }

  resume(filter?: ObjectQueueFilter<T>): void {
    if (!this.pending) {
      return;
    }

    for (let object of this.pending) {
      if (!filter || filter(object)) {
        this.handler(object);
      }
    }

    this.pending = undefined;
  }
}
