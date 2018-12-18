import {AccessControlEntryRuleName} from '../access-control';
import {AccessControlRuleTester} from '../context';

import {AccessControlRuleEntry, ISyncableObject} from './syncable-object';

const hasOwnProperty = Object.prototype.hasOwnProperty;

export type AccessControlRuleDecorator = (
  target: ISyncableObject,
  name: string,
  descriptor: TypedPropertyDescriptor<AccessControlRuleTester>,
) => void;

export function AccessControlRule(
  explicitName?: string,
): AccessControlRuleDecorator {
  return (target, name, descriptor) => {
    let entryName = (explicitName || name) as AccessControlEntryRuleName;

    let test = descriptor.value!;

    if (hasOwnProperty.call(target, '__accessControlRuleMap')) {
      target.__accessControlRuleMap.set(entryName, {test});
    } else {
      let accessControlRules: [
        AccessControlEntryRuleName,
        AccessControlRuleEntry
      ][];

      if (target.__accessControlRuleMap) {
        accessControlRules = [
          ...target.__accessControlRuleMap.entries(),
          [entryName, {test}],
        ];
      } else {
        accessControlRules = [[entryName, {test}]];
      }

      Object.defineProperty(target, '__accessControlRuleMap', {
        value: new Map(accessControlRules),
      });
    }
  };
}
