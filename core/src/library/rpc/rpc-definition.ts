export interface IRPCDefinition {
  name: string;
  args: unknown[];
  return: unknown;
}

export type RPCFunction<TDefinition extends IRPCDefinition> = (
  ...args: TDefinition['args']
) => TDefinition['return'];

export type RPCFunctionDict<TDefinition extends IRPCDefinition> = {
  [TName in TDefinition['name']]: RPCFunction<
    Extract<TDefinition, {name: TName}>
  >
};
