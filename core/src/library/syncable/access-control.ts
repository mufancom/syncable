import {Flatten, Nominal} from 'tslang';

export type AccessRight = 'read' | 'write' | 'full';

export const ACCESS_RIGHTS: AccessRight[] = ['read', 'write', 'full'];

export type AccessControlEntryType = 'allow' | 'deny';

export type AccessControlEntryRuleName = Nominal<
  string,
  'access-control-entry-rule-name'
>;

export interface IAccessControlEntry<TOptions extends object> {
  name: string;
  rule: AccessControlEntryRuleName;
  type: AccessControlEntryType;
  explicit: boolean;
  rights: AccessRight[];
  options?: TOptions;
}

export type AccessControlEntry =
  | ObjectAccessControlEntry
  | FieldAccessControlEntry;

export interface ObjectAccessControlEntry<TOptions extends object = object>
  extends IAccessControlEntry<TOptions> {}

export interface FieldAccessControlEntry<TOptions extends object = object>
  extends IAccessControlEntry<TOptions> {
  fields: string[];
}

export function getAccessControlEntryPriority({
  explicit,
  type,
  fields,
}: Flatten<AccessControlEntry>): number {
  return (
    // tslint:disable-next-line:no-bitwise
    (fields ? 0b0100 : 0) |
    (explicit ? 0b0010 : 0) |
    (type === 'deny' ? 0b0001 : 0)
  );
}
