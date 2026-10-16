/** Feature must be explicitly enabled AND isolated from Firebase production. */
export function workflowV07Enabled(flag: unknown, firebaseConfigured: boolean, usingEmulators: boolean): boolean {
  return flag === 'true' && (!firebaseConfigured || usingEmulators);
}
