import {Nominal} from 'tslang';

export type NumericTimestamp = Nominal<number, 'timestamp'>;

declare global {
  interface DateConstructor {
    now(): NumericTimestamp;
  }
}
