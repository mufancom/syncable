import {Server as HTTPServer} from 'http';

import {ChangePlant, Syncable, SyncableManager} from '@syncable/core';
import {ConnectionSocket, Server, ViewQueryFilter} from '@syncable/server';
import {MongoClient} from 'mongodb';

import {MFChange, MFViewQuery, User} from '../shared';

export class MFServer extends Server<MFChange, MFViewQuery> {
  private dbClientPromise = MongoClient.connect('mongodb://localhost:27017', {
    useNewUrlParser: true,
  });

  constructor(
    httpServer: HTTPServer,
    manager: SyncableManager,
    changePlant: ChangePlant<MFChange>,
  ) {
    super(httpServer, manager, changePlant);
  }

  getViewQueryFilter(query: MFViewQuery): ViewQueryFilter {
    return () => true;
  }

  protected getGroupName(socket: ConnectionSocket): string {
    return 'test';
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
