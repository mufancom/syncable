import {StringType} from '../lang';

export type AccessRight = 'read' | 'write' | 'associate';

export const ACCESS_RIGHTS: AccessRight[] = ['read', 'write', 'associate'];

export type AccessControlEntryType = 'allow' | 'deny';

export type AccessControlEntryRuleName = StringType<
  'access-control-entry-rule-name'
>;

export interface AccessControlEntry<Options extends object = object> {
  name: string;
  rule: AccessControlEntryRuleName;
  type: AccessControlEntryType;
  explicit: boolean;
  grantable: boolean;
  rights: AccessRight[];
  options?: Options;
}

export function getAccessControlEntryPriority(
  {explicit, type}: AccessControlEntry,
  securing: boolean,
): number {
  return (
    // tslint:disable-next-line:no-bitwise
    (explicit ? 0b1000 : 0) &
    (securing ? 0b0100 : 0) &
    (type === 'deny' ? 0b0010 : 0)
  );
}
