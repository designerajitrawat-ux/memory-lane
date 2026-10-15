import { api } from "@/lib/api";

let pending: ReturnType<typeof api.listDemoProfiles> | null = null;

/**
 * The demo profiles, asked once per page however many parts of it show them (the landing's pictures
 * and its session preview), so a sleeping agent is woken once. A failure is forgotten, so a retry asks
 * again.
 */
export function loadDemos() {
  pending ??= api.listDemoProfiles().then((r) => {
    if (!r.ok) pending = null;
    return r;
  });
  return pending;
}
