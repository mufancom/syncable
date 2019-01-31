import {
  AbstractContext,
  ContextEnvironment,
  ContextType,
  SyncableRef,
} from '@syncable/core';

import {User} from './syncables';

export class Context extends AbstractContext<User> {
  constructor(
    type: ContextType,
    environment: ContextEnvironment,
    userRef?: SyncableRef<User>,
  ) {
    super(type, environment, userRef);
  }

  get disabled(): boolean {
    return false;
  }
}
