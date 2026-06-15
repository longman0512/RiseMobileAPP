/** Latched after the first cold-start bootstrap; avoids splash/nav flicker on later refreshes. */
let initialBootstrapDone = false;

export function isInitialBootstrapDone(): boolean {
  return initialBootstrapDone;
}

export function markInitialBootstrapDone(): void {
  initialBootstrapDone = true;
}
