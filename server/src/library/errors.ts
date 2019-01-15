import ExtendableError from 'extendable-error';

export class RPCError extends ExtendableError {
  message!: string;

  constructor(public code: string, message?: string) {
    super(message);
  }
}
