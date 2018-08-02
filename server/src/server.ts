import {
  Change,
  ChangePlant,
  GeneralChange,
  UserSyncableObject,
} from '@syncable/core';
import io = require('socket.io');

import {ServerContext} from './server-context';

export abstract class Server<
  TUser extends UserSyncableObject,
  TChange extends Change
> {
  private server = io();

  constructor(protected changePlant: ChangePlant<TChange>) {}

  protected abstract createContext(): ServerContext<TUser>;
}
