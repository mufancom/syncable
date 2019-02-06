import {Kanban} from './kanban';
import {Task} from './task';
import {User} from './user';

export type SyncableObject = User | Task | Kanban;

export type Syncable = SyncableObject['syncable'];

export * from './task';
export * from './user';
export * from './kanban';
