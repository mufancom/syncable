import {Change, ChangePlant, Dict, Resource, ResourceRef} from '@syncable/core';
import * as v from 'villa';

import {ServerContext} from './context';

export abstract class ServerChangePlant extends ChangePlant {
  constructor(public context: ServerContext) {
    super();
  }

  async apply(change: Change): Promise<void> {
    let refDict = change.refs;
    // tslint:disable-next-line:no-null-keyword
    let resourceDict: Dict<Resource> = Object.create(null);

    let entries = Object.keys(refDict).map((name): [string, ResourceRef] => [
      name,
      refDict[name],
    ]);

    await v.parallel(entries, async ([name, ref]) => {
      resourceDict[name] = await this.context.resolve(ref);
    });

    this.process(resourceDict, change);
  }
}
