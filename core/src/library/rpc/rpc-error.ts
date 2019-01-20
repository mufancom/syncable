import ExtendableError from 'extendable-error';

export class RPCError extends ExtendableError {
  constructor(readonly code: string, message?: string) {
    super(message);
  }
}
