import {Server as HTTPServer} from 'http';

import {
  ChangePlant,
  Syncable,
  SyncableManager,
  getSyncableRef,
} from '@syncable/core';
import {
  ConnectionSession,
  ConnectionSocket,
  Server,
  ViewQueryFilter,
} from '@syncable/server';
import {MongoClient} from 'mongodb';

import {
  MFChange,
  MFSyncableObjectFactory,
  MFViewQuery,
  User,
  UserSyncable,
} from '../shared';

export class MFServer extends Server<MFChange, MFViewQuery> {
  private dbClientPromise = MongoClient.connect('mongodb://localhost:27017', {
    useNewUrlParser: true,
  });

  constructor(
    httpServer: HTTPServer,
    factory: MFSyncableObjectFactory,
    changePlant: ChangePlant<MFChange>,
  ) {
    super(httpServer, factory, changePlant);
  }

  getViewQueryFilter(query: MFViewQuery): ViewQueryFilter {
    return () => true;
  }

  protected async resolveSession(
    socket: ConnectionSocket,
  ): Promise<ConnectionSession> {
    let dbClient = await this.dbClientPromise;

    let userSyncable = (await dbClient
      .db('syncable-design')
      .collection('syncables')
      .findOne({_type: 'user'})) as UserSyncable;

    return {
      group: 'test',
      userRef: getSyncableRef(userSyncable),
    };
  }

  protected async loadSyncables(group: string): Promise<Syncable[]> {
    let dbClient = await this.dbClientPromise;

    let syncables = (await dbClient
      .db('syncable-design')
      .collection('syncables')
      .find({})
      .toArray()) as Syncable[];

    return syncables;
  }
}
