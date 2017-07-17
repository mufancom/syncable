export type ObjectQueueHandler<T> = (object: T) => void;
export type ObjectQueueFilter<T> = (object: T) => boolean;

export abstract class ObjectQueue<T> {
  private channelToPendingObjectsMap = new Map<string, T[]>();

  add(object: T): void {
    let channel = this.resolveChannel(object);
    let pendingObjects = this.channelToPendingObjectsMap.get(channel);

    if (pendingObjects) {
      pendingObjects.push(object);
    } else {
      this.emit(object);
    }
  }

  pause(channel: string): void {
    if (!this.channelToPendingObjectsMap.has(channel)) {
      this.channelToPendingObjectsMap.set(channel, []);
    }
  }

  resume(channel: string, filter?: ObjectQueueFilter<T>): void {
    let pendingObjects = this.channelToPendingObjectsMap.get(channel);

    if (!pendingObjects) {
      return;
    }

    for (let object of pendingObjects) {
      if (!filter || filter(object)) {
        this.emit(object);
      }
    }

    this.channelToPendingObjectsMap.delete(channel);
  }

  protected abstract emit(object: T): void;
  protected abstract resolveChannel(_object: T): string;
}
