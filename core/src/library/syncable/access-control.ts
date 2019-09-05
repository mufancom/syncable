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
  rights: AccessRight[];
  fields?: string[];
  options?: TOptions;
}

export function getAccessControlEntryPriority({
  explicit,
  type,
  fields,
}: AccessControlEntry): number {
  return (
    // tslint:disable-next-line:no-bitwise
    (fields ? 0b0100 : 0) |
    (explicit ? 0b0010 : 0) |
    (type === 'deny' ? 0b0001 : 0)
  );
}
