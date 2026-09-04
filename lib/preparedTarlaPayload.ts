export function exactPreparedTarlaInstruction(input: {
  preparedInstruction?: string;
  currentInstruction: string;
}) {
  if (!input.preparedInstruction) return input.currentInstruction;
  if (input.preparedInstruction !== input.currentInstruction) {
    throw new Error("Prepared Tarla payload is stale; prepare again");
  }
  return input.preparedInstruction;
}
