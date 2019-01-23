import {
  ChangePacket,
  ChangePacketId,
  ChangePlant,
  NumericTimestamp,
  SyncableContainer,
  getSyncableRef,
} from '@syncable/core';
import Lolex, {Clock} from 'lolex';

import {blueprint} from './@blueprint';
import {clientContext} from './@context';
import {syncableAdapter} from './@syncable-adapter';
import {taskSyncableA} from './@syncables';

const changePlant = new ChangePlant(blueprint, syncableAdapter);

let lolexClock: Clock;

beforeAll(() => {
  lolexClock = Lolex.install({
    now: 1500000000000,
  });
});

afterAll(() => {
  lolexClock.uninstall();
});

test('should get correct result of "task:update-task-brief"', () => {
  let container = new SyncableContainer(syncableAdapter);

  container.addSyncable(taskSyncableA);

  let packet: ChangePacket = {
    id: 'change-packet-id-1' as ChangePacketId,
    type: 'task:update-task-brief',
    refs: {
      task: getSyncableRef(taskSyncableA),
    },
    options: {
      brief: 'Hello, update!',
    },
    createdAt: Date.now() as NumericTimestamp,
  };

  expect(
    changePlant.process(packet, clientContext, container),
  ).toMatchSnapshot();
});
