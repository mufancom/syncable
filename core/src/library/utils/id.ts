import uuid from 'uuid';

export function generateUniqueId(): string {
  return uuid();
}
