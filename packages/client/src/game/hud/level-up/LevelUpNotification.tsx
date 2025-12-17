/**
 * LevelUpNotification - Main composition root for level-up notifications
 *
 * Combines:
 * - useLevelUpState: Event subscription and queue management
 * - LevelUpPopup: Visual popup display
 * - levelUpAudio: Placeholder fanfare sounds
 *
 * Fireworks animation added in Phase 3.
 * Chat message integration added in Phase 4.
 */

import { useEffect, useRef } from "react";
import type { ClientAudio } from "@hyperscape/shared";
import type { ClientWorld } from "../../../types";
import { useLevelUpState } from "./useLevelUpState";
import { LevelUpPopup } from "./LevelUpPopup";
import { playLevelUpFanfare } from "./levelUpAudio";

interface LevelUpNotificationProps {
  world: ClientWorld;
}

export function LevelUpNotification({ world }: LevelUpNotificationProps) {
  const { currentLevelUp, dismissLevelUp } = useLevelUpState(world);

  // Track which level-ups we've played sound for (by timestamp)
  const playedSoundsRef = useRef<Set<number>>(new Set());

  // Play audio when a new level-up appears
  useEffect(() => {
    if (!currentLevelUp) return;

    // Skip if we already played sound for this level-up
    if (playedSoundsRef.current.has(currentLevelUp.timestamp)) return;
    playedSoundsRef.current.add(currentLevelUp.timestamp);

    // Get audio system
    const audio = world.audio as ClientAudio | undefined;
    if (!audio?.ctx) return;

    // Check if SFX is muted
    const sfxVolume = audio.groupGains?.sfx?.gain?.value ?? 1;
    if (sfxVolume === 0) return;

    // Play fanfare (uses audio.ready to handle suspended AudioContext)
    audio.ready(() => {
      playLevelUpFanfare(
        currentLevelUp.newLevel,
        audio.ctx,
        audio.groupGains?.sfx,
      );
    });
  }, [currentLevelUp, world]);

  // Cleanup old timestamps periodically to prevent memory leak
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      const threshold = 60000; // 1 minute
      playedSoundsRef.current.forEach((timestamp) => {
        if (now - timestamp > threshold) {
          playedSoundsRef.current.delete(timestamp);
        }
      });
    }, 30000); // Every 30 seconds

    return () => clearInterval(cleanup);
  }, []);

  // Don't render if no level-up to display
  if (!currentLevelUp) {
    return null;
  }

  return <LevelUpPopup event={currentLevelUp} onDismiss={dismissLevelUp} />;
}
