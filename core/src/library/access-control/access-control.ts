import {Nominal} from 'tslang';

export type AccessRight = 'read' | 'write' | 'full';

export const ACCESS_RIGHTS: AccessRight[] = ['read', 'write', 'full'];

export type AccessControlEntryType = 'allow' | 'deny';

export type AccessControlEntryRuleName = Nominal<
  string,
  'access-control-entry-rule-name'
>;

export interface AccessControlEntry<TOptions extends object = object> {
  name: string;
  rule: AccessControlEntryRuleName;
  type: AccessControlEntryType;
  explicit: boolean;
  grantable: boolean;
  rights: AccessRight[];
  options?: TOptions;
}

export interface SecuringAccessControlEntryNegativeMatch {
  not: string | string[];
}

export type SecuringAccessControlEntryMatch =
  | (string | string[])
  | SecuringAccessControlEntryNegativeMatch;

export interface SecuringAccessControlEntry<TOptions extends object = object>
  extends AccessControlEntry<TOptions> {
  /**
   * Type of syncable to be secured or not secured.
   */
  match?: SecuringAccessControlEntryMatch;

  type: 'deny';
}

export function getAccessControlEntryPriority(
  {explicit, type}: AccessControlEntry,
  securing: boolean,
): number {
  return (
    // tslint:disable-next-line:no-bitwise
    (explicit ? 0b1000 : 0) |
    (securing ? 0b0100 : 0) |
    (type === 'deny' ? 0b0010 : 0)
  );
}
