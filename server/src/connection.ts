import {ChangePlant, GeneralChange, UserSyncableObject} from '@syncable/core';
import {ServerContext} from './server-context';

export class Connection {
  constructor(
    private context: ServerContext<UserSyncableObject>,
    private changePlant: ChangePlant<GeneralChange>,
  ) {}
}
