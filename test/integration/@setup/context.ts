import {AbstractContext, ContextEnvironment, ContextType} from '@syncable/core';

import {UserId} from './syncables';

export class Context extends AbstractContext<UserId> {
  constructor(
    type: ContextType,
    environment: ContextEnvironment,
    private userId: UserId,
  ) {
    super(type, environment);
  }

  get data(): UserId {
    return this.userId;
  }

  setData(userId: UserId): void {
    this.userId = userId;
  }
}
