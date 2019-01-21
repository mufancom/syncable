import {IRPCAdapter} from '@syncable/core';

export interface IConnectionSource extends IRPCAdapter {
  group: string;
}
