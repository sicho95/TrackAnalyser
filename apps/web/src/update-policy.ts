export function canActivateUpdate(activeSessionId: string | undefined): boolean {
  return activeSessionId === undefined
}
