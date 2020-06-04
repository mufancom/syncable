import {Flatten, Nominal} from 'tslang';

import {ISyncable} from './syncable';

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
  fields: string[] | '*';
}

export const SYNCABLE_ESSENTIAL_FIELD_NAMES: (keyof ISyncable)[] = [
  '_type',
  '_id',
  '_clock',
  '_createdAt',
  '_updatedAt',
  '_acl',
  '_sanitizedFieldNames',
];

export function getAccessControlEntryPriority({
  explicit,
  type,
}: Flatten<AccessControlEntry>): number {
  return (
    // tslint:disable-next-line:no-bitwise
    (explicit ? 0b0010 : 0) | (type === 'deny' ? 0b0001 : 0)
  );
}
