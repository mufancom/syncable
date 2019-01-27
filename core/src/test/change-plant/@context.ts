import {AbstractContext} from '@syncable/core';

export class Context extends AbstractContext<undefined> {
  getData(): undefined {
    return;
  }

  setData(): void {}
}

export const serverContext = new Context('user', 'server');
export const clientContext = new Context('user', 'client');
