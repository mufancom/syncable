export type AccessRight = 'read' | 'write' | 'associate';

export type AccessControlEntry =
  | BasicAccessControlEntry
  | CustomAccessControlEntry;

export interface BasicAccessControlEntry {
  explicit: boolean;
  grantable: boolean;
  rights: AccessRight[];
}

export interface CustomAccessControlEntry<Options extends object = object>
  extends BasicAccessControlEntry {
  name: string;
  options?: Options;
}
