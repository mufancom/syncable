import {ChangePlant, SyncableObjectFactory} from '@syncable/core';
import {Server, ServerContext} from '@syncable/server';

import {MFChange} from '../shared/change-plant';
import {User} from '../shared/syncables';
import {MFServerContext} from './mf-server-context';

export class MFServer extends Server<User, MFChange> {
  constructor(
    private factory: SyncableObjectFactory,
    changePlant: ChangePlant<MFChange>,
  ) {
    super(changePlant);
  }

  protected createContext(): ServerContext<User> {
    return new MFServerContext(this.factory);
  }
}
