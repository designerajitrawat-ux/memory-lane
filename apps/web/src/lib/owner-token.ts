// The owner token proves "these profiles are mine" without a login (docs/04 §4). It lives only on this
// device. Storage can be unavailable (private mode, blocked site data), so fall back to memory and
// tell the caregiver (security review W4).
const KEY = "memory-lane.owner-token";
let memory: string | null = null;

export function getOwnerToken(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

/** Stores the token; returns false when it will only last until the tab closes. */
export function setOwnerToken(token: string): boolean {
  memory = token;
  try {
    window.localStorage.setItem(KEY, token);
    return true;
  } catch {
    return false;
  }
}

/** "Forget profiles on this device" (shared tablets, family PCs). The profiles stay until purged. */
export function clearOwnerToken(): void {
  memory = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing stored
  }
}

/** Whether this browser can keep the token after the tab closes. */
export function canRememberOnThisDevice(): boolean {
  try {
    const probe = `${KEY}.probe`;
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
