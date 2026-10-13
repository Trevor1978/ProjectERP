/** Resolve the stored completed flag from an explicit checkbox or a percent edit. */
export function nextCompletedFlag(input: {
  currentCompleted: boolean;
  currentPercent: number;
  completed?: boolean;
  percentComplete?: number;
}): boolean {
  if (input.completed !== undefined) return input.completed;
  if (input.percentComplete === undefined) return input.currentCompleted;
  if (input.percentComplete >= 100) return true;
  if (input.currentPercent >= 100) return false;
  return input.currentCompleted;
}
