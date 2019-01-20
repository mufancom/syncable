import {RPCPeer} from '@syncable/core';

import {createAdapterPair} from './@adapter';
import {
  ThatDefinition,
  ThisDefinition,
  thatFunctionDict,
  thisFunctionDict,
} from './@peer';

const [thisAdapter, thatAdapter] = createAdapterPair();

const thisPeer = new RPCPeer<ThisDefinition, ThatDefinition>(
  thisAdapter,
  thisFunctionDict,
);

const thatPeer = new RPCPeer<ThatDefinition, ThisDefinition>(
  thatAdapter,
  thatFunctionDict,
);

test('should call `this` remote function from `that` and get return value', async () => {
  let fooValue = await thatPeer.call('foo', 'hello, world', 5);
  // tslint:disable-next-line:no-void-expression
  let barValue = await thatPeer.call('bar', false);

  expect(fooValue).toBe('hello');
  expect(barValue).toBeUndefined();
});

test('should call `this` remote function from `that` and get error', async () => {
  await expect(thatPeer.call('bar', true)).rejects.toMatchInlineSnapshot(
    `[RPCError: Bar error occurred]`,
  );
});

test('should call `that` remote function from `this` and get return value', async () => {
  let value = await thisPeer.call('yoha', 'hello, world', 5);

  expect(value).toBe('hello');
});
