import {Server as HTTPServer} from 'http';

import {ChangePlant, ContextCache} from '@syncable/core';
import {Server} from '@syncable/server';

import {MFChange, MFSyncableObjectFactory, User} from '../shared';

import {MFServerContext} from './mf-server-context';

export class MFServer extends Server<User, MFChange> {
  private cache = new ContextCache();

  constructor(
    httpServer: HTTPServer,
    private factory: MFSyncableObjectFactory,
    changePlant: ChangePlant<MFChange>,
  ) {
    super(httpServer, changePlant);
  }

  protected createContext(): MFServerContext {
    console.log('create context');
    return new MFServerContext(this.cache, this.factory);
  }
}
