import { createSignal } from "solid-js";
import { LeaderboardGhostRun } from "@monkeytype/schemas/leaderboards";

export const [activeGhostRun, setActiveGhostRun] =
  createSignal<LeaderboardGhostRun | null>(null);

export function getActiveGhostRun(): LeaderboardGhostRun | null {
  return activeGhostRun();
}

export function isGhostRaceActive(): boolean {
  return activeGhostRun() !== null;
}

export function clearGhostRun(): void {
  setActiveGhostRun(null);
}
