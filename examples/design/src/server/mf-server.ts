import {
  ChangePlant,
  ISyncable,
  SyncableRef,
  getSyncableRef,
} from '@syncable/core';
import {
  AbstractServer,
  ConnectionSession,
  ConnectionSocket,
  ViewQueryFilter,
} from '@syncable/server';
import {MongoClient} from 'mongodb';
import {Server as SocketServer} from 'socket.io';

import {
  MFChange,
  MFSyncableObject,
  MFSyncableObjectProvider,
  MFViewQuery,
  User,
  UserSyncable,
} from '../shared';

const DB_NAME = 'syncable-design';
const SYNCABLES_COLLECTION_NAME = 'syncables';
const CLOCKS_COLLECTION_NAME = 'clocks';

interface MFGroupClockDocument {
  value: number;
}

export class MFGroupClock {
  constructor(
    private dbClientPromise: Promise<MongoClient>,
    private group: string,
  ) {}

  async next(): Promise<number> {
    let dbClient = await this.dbClientPromise;

    let group = this.group;

    let result = await dbClient
      .db(DB_NAME)
      .collection<MFGroupClockDocument>(CLOCKS_COLLECTION_NAME)
      .findOneAndUpdate(
        {group},
        {$inc: {value: 1}},
        {upsert: true, returnOriginal: false},
      );

    return result.value!.value;
  }
}

export class MFServer extends AbstractServer<{
  user: User;
  syncableObject: MFSyncableObject;
  change: MFChange;
  viewQuery: MFViewQuery;
}> {
  private dbClientPromise = MongoClient.connect('mongodb://localhost:27017', {
    useNewUrlParser: true,
  });

  constructor(
    socketServer: SocketServer,
    factory: MFSyncableObjectProvider,
    changePlant: ChangePlant<User, MFChange>,
  ) {
    super(socketServer, factory, changePlant);
  }

  getViewQueryFilter(_query: MFViewQuery): ViewQueryFilter {
    return () => true;
  }

  createGroupClock(group: string): MFGroupClock {
    return new MFGroupClock(this.dbClientPromise, group);
  }

  protected async resolveSession(
    _socket: ConnectionSocket,
  ): Promise<ConnectionSession<MFViewQuery>> {
    let dbClient = await this.dbClientPromise;

    let userSyncable = (await dbClient
      .db('syncable-design')
      .collection('syncables')
      .findOne({_type: 'user'})) as UserSyncable;

    return {
      group: 'test',
      userRef: getSyncableRef(userSyncable),
      viewQuery: {view: 'home'},
    };
  }

  protected async loadSyncables(_group: string): Promise<ISyncable[]> {
    let dbClient = await this.dbClientPromise;

    let syncables = await dbClient
      .db(DB_NAME)
      .collection<ISyncable>(SYNCABLES_COLLECTION_NAME)
      .find({})
      .toArray();

    return syncables;
  }

  protected async saveSyncables(
    updates: ISyncable[],
    creations: ISyncable[],
    removals: SyncableRef[],
  ): Promise<void> {
    let dbClient = await this.dbClientPromise;

    await dbClient
      .db(DB_NAME)
      .collection<ISyncable>(SYNCABLES_COLLECTION_NAME)
      .bulkWrite([
        ...updates.map(syncable => {
          return {
            updateOne: {
              filter: {_id: syncable._id},
              update: {$set: syncable},
            },
          };
        }),
        ...creations.map(syncable => {
          return {
            insertOne: {
              document: syncable,
            },
          };
        }),
        {
          deleteMany: {
            filter: {_id: {$in: removals.map(ref => ref.id)}},
          },
        },
      ]);
  }
}
