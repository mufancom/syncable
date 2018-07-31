import {
  AccessControlChange,
  AccessRight,
  AssociateChange,
  Change,
  ChangePlant,
  ConsequentSeries,
  Dict,
  GeneralChange,
  Syncable,
  SyncableObject,
  SyncableRef,
  UserSyncableObject,
} from '@syncable/core';
import _ = require('lodash');

import {ClientContext} from './client-context';

export interface SnapshotsData {
  snapshots: Syncable[];
}

export interface TestSocket extends SocketIOClient.Socket {
  on(event: 'reconnect', listener: (attempt: number) => void): this;
  on(
    event: 'consequent-series',
    listener: (series: ConsequentSeries) => void,
  ): this;
  on(event: 'snapshots', listener: (syncables: Syncable[]) => void): this;

  emit(event: 'update', update: ClientUpdate): this;
  emit(event: 'request', request: Request): this;
}

export class Client<TUser extends UserSyncableObject, TChange extends Change> {
  viewQuery: ViewQuery | undefined;

  constructor(context: ClientContext<TUser>, changePlant: ChangePlant<TChange>);
  constructor(
    private context: ClientContext,
    private changePlant: ChangePlant<GeneralChange>,
  ) {}

  associate(
    {ref: target}: SyncableObject,
    {ref: source}: SyncableObject,
  ): void {
    this.pushChange({
      type: '$associate',
      refs: {target, source},
      options: {requisite: true},
    });
  }

  unassociate(
    {ref: target}: SyncableObject,
    {ref: source}: SyncableObject,
  ): void {
    this.pushChange({
      type: '$unassociate',
      refs: {target, source},
      options: {requisite: true},
    });
  }

  private pushChange(change: GeneralChange): void {
    let context = this.context;

    let refDict = change.refs;

    let syncableDict = _.mapValues(refDict, ref =>
      context.requireSyncable(ref),
    );

    let outputDict = this.changePlant.process(change, syncableDict);

    let requiringRightsDict = _.mapValues(
      outputDict,
      ({rights, diffs}): AccessRight[] => {
        // TODO: is 'read' right necessary?
        return _.uniq([
          ...(rights || []),
          ...(diffs ? (['write'] as AccessRight[]) : []),
        ]);
      },
    );

    for (let [name, rights] of Object.entries(requiringRightsDict)) {
      let ref = refDict[name];
      let object = context.require(ref);

      object.validateAccessRights(rights);
    }

    for (let [name, syncable] of Object.entries(syncableDict)) {
      let {diffs} = outputDict[name];

      if (!diffs) {
        continue;
      }

      for (let diff of diffs) {
        DeepDiff.applyChange(syncable, {}, diff);
      }
    }
  }

  private onSnapshots(
    syncables: Syncable[],
    userRef?: SyncableRef<TUser>,
  ): void {
    for (let syncable of syncables) {
      this.context.addSyncable(syncable);
    }

    if (userRef) {
      this.context.initialize(userRef);
    }
  }

  private onChange(change: Change): void {}
}
