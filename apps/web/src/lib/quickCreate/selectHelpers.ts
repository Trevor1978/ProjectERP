/** Whether the empty placeholder option must be present for a valid select value. */
export function needsPlaceholderOption(
  value: string,
  allowEmpty: boolean | undefined,
): boolean {
  if (allowEmpty) return true;
  return !value;
}
