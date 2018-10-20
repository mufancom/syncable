import {AccessControlEntryRuleName} from '../access-control';
import {AccessControlRuleTester} from '../context';

import {ISyncableObject} from './syncable-object';

export type AccessControlRuleDecorator = (
  target: ISyncableObject,
  name: string,
  descriptor: TypedPropertyDescriptor<AccessControlRuleTester>,
) => void;

export function AccessControlRule(
  explicitName?: string,
): AccessControlRuleDecorator {
  return (target, name, descriptor) => {
    let test = descriptor.value!;

    let ruleMap =
      target.__accessControlRuleMap ||
      (target.__accessControlRuleMap = new Map());

    ruleMap.set((explicitName || name) as AccessControlEntryRuleName, {test});
  };
}
