/** Feature must be explicitly enabled. Firebase production additionally needs its own explicit
 * opt-in (`VITE_WORKFLOW_V07_ALLOW_PRODUCTION=true`); offline and emulator use the first flag only. */
export function workflowV07Enabled(flag: unknown, firebaseConfigured: boolean, usingEmulators: boolean, allowProduction: unknown = undefined): boolean {
  return flag === 'true' && (!firebaseConfigured || usingEmulators || allowProduction === 'true');
}
