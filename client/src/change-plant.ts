import {Change, ChangePlant, Dict, Resource} from '@syncable/core';

import {ClientContext} from './context';

export abstract class ClientChangePlant extends ChangePlant {
  constructor(public context: ClientContext) {
    super();
  }

  apply(change: Change): void {
    let refDict = change.refs;
    // tslint:disable-next-line:no-null-keyword
    let resourceDict: Dict<Resource> = Object.create(null);

    for (let name of Object.keys(refDict)) {
      let ref = refDict[name];
      let resource = this.context.get(ref);

      if (!resource) {
        throw new Error(`Missing resource [${ref.type}] ${ref.id}`);
      }
    }

    this.process(resourceDict, change);
  }
}
