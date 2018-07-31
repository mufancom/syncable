import {AccessControlEntryRuleName} from '../access-control';
import {AccessControlRuleTester} from '../context';
import {SyncableObject} from './syncable-object';

export function AccessControlRule(explicitName?: string) {
  return (
    target: SyncableObject,
    name: string,
    descriptor: TypedPropertyDescriptor<AccessControlRuleTester>,
  ) => {
    let test = descriptor.value!;

    target.__accessControlRuleMap.set(
      (explicitName || name) as AccessControlEntryRuleName,
      {test},
    );
  };
}
