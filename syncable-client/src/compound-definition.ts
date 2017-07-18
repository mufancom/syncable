import { Syncable } from 'syncable';

import { Client, CompoundDependencyHost } from './client';

export type CompoundEntryResolver<T extends Syncable, TEntry extends Syncable> =
  (object: T, host: CompoundDependencyHost) => TEntry | string | undefined;

export interface CompoundDependencyOptions<T extends Syncable, TEntry extends Syncable> {
  indexes?: (keyof T)[];
  requestAbsentEntries?: boolean;
  compoundEntryResolver: CompoundEntryResolver<T, TEntry>;
}

export interface CompoundEntryOptions<T> {
  indexes?: (keyof T)[];
}

export interface Dependency<T extends Syncable, TEntry extends Syncable> {
  subject: string;
  options: CompoundDependencyOptions<T, TEntry>;
}

export abstract class CompoundDefinition<T, TEntry extends Syncable> {
  /** @internal */
  _client: Client;

  entry: string;
  dependencies: Dependency<Syncable, TEntry>[] = [];

  get client(): Client {
    return this._client;
  }

  abstract buildCompound(entry: TEntry, host: CompoundDependencyHost): T | undefined;

  protected registerEntry(
    subject: string,
    {indexes}: CompoundEntryOptions<TEntry> = {},
  ): void {
    let dependency: Dependency<TEntry, TEntry> = {
      subject,
      options: {
        indexes,
        compoundEntryResolver(object: TEntry) { return object; },
      },
    };

    this.entry = subject;
    this.dependencies.push(dependency);
  }

  protected registerDependency<TDependency extends Syncable>(
    subject: string,
    options: CompoundDependencyOptions<TDependency, TEntry>,
  ): void {
    this.dependencies.push({subject, options});
  }
}
