import {AbstractContext} from '@syncable/core';

export class Context extends AbstractContext {}

export const serverContext = new Context('user', 'server');
export const clientContext = new Context('user', 'client');
