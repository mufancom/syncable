import {StringType} from '../lang';

export type AccessRight = 'read' | 'write' | 'associate';

export const ACCESS_RIGHTS: AccessRight[] = ['read', 'write', 'associate'];

export type AccessControlEntryType = 'allow' | 'deny';

export type AccessControlEntry =
  | BasicAccessControlEntry
  | CustomAccessControlEntry;

export interface BasicAccessControlEntry {
  type: AccessControlEntryType;
  explicit: boolean;
  grantable: boolean;
  rights: AccessRight[];
}

export type AccessControlEntryName = StringType<'access-control-entry-name'>;

export interface CustomAccessControlEntry<Options extends object = object>
  extends BasicAccessControlEntry {
  name: AccessControlEntryName;
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
