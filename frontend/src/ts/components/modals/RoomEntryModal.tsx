import {
  RoomConfig,
  RoomConfigSchema,
  RoomMode,
} from "@monkeytype/schemas/rooms";
import { useQuery } from "@tanstack/solid-query";
import { createSignal, For, JSXElement, Show } from "solid-js";
import { z } from "zod";

import Ape from "../../ape";
import { getConfig } from "../../config/store";
import { createEffectOn } from "../../hooks/effects";
import { getServerConfigurationQueryOptions } from "../../queries/server-configuration";
import { getUserData } from "../../queries/user";
import { navigate } from "../../router/navigate";
import { hideModal, isModalOpen } from "../../states/modals";
import {
  showErrorNotification,
  showNoticeNotification,
} from "../../states/notifications";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";
import { Fa } from "../common/Fa";

const TIME_MODES = ["15", "30", "60", "120"] as const;
const WORDS_MODES = ["10", "25", "50", "100"] as const;

export const ROOM_PREVIEW_STORAGE_KEY = "mt_room_preview";
export const ROOM_PREVIEW_LEGACY_PREFIX = "mt_room_preview:";

export const RoomPreviewCacheSchema = z.object({
  roomId: z.string().min(1),
  code: z.string().min(1),
  config: RoomConfigSchema,
  expiresAt: z.number().int().nonnegative().optional(),
});

export type RoomPreviewCache = z.infer<typeof RoomPreviewCacheSchema>;

function pruneLegacyRoomPreviews(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(ROOM_PREVIEW_LEGACY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    sessionStorage.removeItem(key);
  }
}

function saveRoomPreview(preview: RoomPreviewCache): void {
  try {
    pruneLegacyRoomPreviews();
    sessionStorage.setItem(ROOM_PREVIEW_STORAGE_KEY, JSON.stringify(preview));
  } catch {
    // ignore storage errors
  }
}

export function RoomEntryModal(): JSXElement {
  const serverConfig = useQuery(() => getServerConfigurationQueryOptions());
  const maxAllowedPlayers = (): number =>
    serverConfig.data?.rooms?.maxPlayersPerRoom ?? 10;

  const [mode, setMode] = createSignal<"time" | "words">("time");
  const [mode2, setMode2] = createSignal<string>("60");
  const [maxPlayers, setMaxPlayers] = createSignal<number>(4);
  const [inviteCode, setInviteCode] = createSignal<string>("");
  const [isCreating, setIsCreating] = createSignal(false);
  const [isJoining, setIsJoining] = createSignal(false);

  createEffectOn(
    () => isModalOpen("RoomEntry"),
    (open) => {
      if (open) {
        const currentMode: RoomMode =
          getConfig.mode === "words" ? "words" : "time";
        setMode(currentMode);
        setMode2(
          currentMode === "time"
            ? TIME_MODES.includes(
                String(getConfig.time) as (typeof TIME_MODES)[number],
              )
              ? String(getConfig.time)
              : "60"
            : WORDS_MODES.includes(
                  String(getConfig.words) as (typeof WORDS_MODES)[number],
                )
              ? String(getConfig.words)
              : "50",
        );
        setMaxPlayers(Math.min(4, maxAllowedPlayers()));
        setInviteCode("");
      }
    },
  );

  const handleModeChange = (nextMode: "time" | "words"): void => {
    setMode(nextMode);
    setMode2(nextMode === "time" ? "60" : "50");
  };

  const handleCreateRoom = async (): Promise<void> => {
    if (isCreating() || isJoining()) return;
    setIsCreating(true);

    const config: RoomConfig = {
      mode: mode(),
      mode2: mode2(),
      language: getConfig.language,
      punctuation: getConfig.punctuation,
      numbers: getConfig.numbers,
      difficulty: getConfig.difficulty,
      stopOnError: getConfig.stopOnError,
      maxPlayers: Math.min(Math.max(2, maxPlayers()), maxAllowedPlayers()),
    };

    try {
      const response = await Ape.rooms.create({ body: { config } });

      if (response.status === 201) {
        const data = response.body.data;
        saveRoomPreview({
          roomId: data.roomId,
          code: data.code,
          config: data.config,
          expiresAt: data.expiresAt,
        });
        hideModal("RoomEntry");
        await navigate({
          to: "/room/$roomId",
          params: { roomId: data.roomId },
        });
        return;
      }

      showErrorNotification(`Failed to create room: ${response.body.message}`);
    } catch (error: unknown) {
      showErrorNotification("Failed to create room", { error });
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinByCode = async (e: SubmitEvent): Promise<void> => {
    e.preventDefault();
    if (isCreating() || isJoining()) return;

    const normalized = inviteCode().trim().toUpperCase();
    if (!/^[A-Z0-9]{4,16}$/.test(normalized)) {
      showNoticeNotification("Enter a valid 4-16 character invite code");
      return;
    }

    setIsJoining(true);
    try {
      const response = await Ape.rooms.getByCode({
        params: { code: normalized },
      });

      if (response.status === 200) {
        const data = response.body.data;
        saveRoomPreview({
          roomId: data.roomId,
          code: data.code,
          config: data.config,
        });
        hideModal("RoomEntry");
        await navigate({
          to: "/room/$roomId",
          params: { roomId: data.roomId },
        });
        return;
      }

      showErrorNotification(`Failed to find room: ${response.body.message}`);
    } catch (error: unknown) {
      showErrorNotification("Failed to find room", { error });
    } finally {
      setIsJoining(false);
    }
  };

  const playerOptions = (): number[] => {
    const cap = Math.min(20, Math.max(2, maxAllowedPlayers()));
    return [2, 3, 4, 5, 8, 10, 15, 20].filter((n) => n <= cap);
  };

  return (
    <AnimatedModal
      id="RoomEntry"
      title="Competitive Room"
      modalClass="max-w-lg"
    >
      <Show
        when={getUserData() !== undefined}
        fallback={
          <div class="grid gap-4 text-sm text-sub">
            <p>Sign in to create or join a competitive typing room.</p>
            <Button
              text="Go to login"
              fa={{ icon: "fa-sign-in-alt" }}
              to="/login"
              onClick={() => hideModal("RoomEntry")}
            />
          </div>
        }
      >
        <div class="grid gap-6">
          <div class="grid gap-3 rounded bg-sub-alt/50 p-4">
            <div class="flex items-center gap-2 text-base font-semibold text-text">
              <Fa icon="fa-plus" class="text-main" />
              <span>Create private room</span>
            </div>

            <div class="grid gap-2">
              <span class="text-xs text-sub">Mode</span>
              <div class="grid grid-cols-2 gap-2">
                <Button
                  text="time"
                  active={mode() === "time"}
                  onClick={() => handleModeChange("time")}
                />
                <Button
                  text="words"
                  active={mode() === "words"}
                  onClick={() => handleModeChange("words")}
                />
              </div>
            </div>

            <div class="grid gap-2">
              <span class="text-xs text-sub">
                {mode() === "time" ? "Duration (seconds)" : "Word count"}
              </span>
              <div class="grid grid-cols-4 gap-2">
                <For each={mode() === "time" ? TIME_MODES : WORDS_MODES}>
                  {(option) => (
                    <Button
                      text={option}
                      active={mode2() === option}
                      onClick={() => setMode2(option)}
                    />
                  )}
                </For>
              </div>
            </div>

            <div class="grid gap-2">
              <span class="text-xs text-sub">Max players</span>
              <div class="flex flex-wrap gap-2">
                <For each={playerOptions()}>
                  {(count) => (
                    <Button
                      text={String(count)}
                      active={maxPlayers() === count}
                      onClick={() => setMaxPlayers(count)}
                    />
                  )}
                </For>
              </div>
            </div>

            <div class="text-xs text-sub">
              Language: <span class="text-text">{getConfig.language}</span>
              {" · "}
              Punctuation:{" "}
              <span class="text-text">
                {getConfig.punctuation ? "on" : "off"}
              </span>
              {" · "}
              Numbers:{" "}
              <span class="text-text">{getConfig.numbers ? "on" : "off"}</span>
            </div>

            <Button
              text={isCreating() ? "Creating..." : "Create private room"}
              fa={{ icon: "fa-flag-checkered" }}
              active={true}
              disabled={isCreating() || isJoining()}
              onClick={() => {
                void handleCreateRoom();
              }}
            />
          </div>

          <form
            class="grid gap-3 rounded bg-sub-alt/50 p-4"
            onSubmit={(e) => {
              void handleJoinByCode(e);
            }}
          >
            <div class="flex items-center gap-2 text-base font-semibold text-text">
              <Fa icon="fa-door-open" class="text-main" />
              <span>Join by invite code</span>
            </div>

            <div class="flex gap-2">
              <input
                type="text"
                class="w-full rounded bg-bg px-3 py-2 font-mono text-text uppercase ring-1 ring-sub-alt focus:ring-main focus:outline-none"
                placeholder="ABCD1234"
                maxLength={16}
                value={inviteCode()}
                onInput={(e) => setInviteCode(e.currentTarget.value)}
              />
              <Button
                type="submit"
                text={isJoining() ? "Joining..." : "Join"}
                disabled={isCreating() || isJoining()}
              />
            </div>
          </form>
        </div>
      </Show>
    </AnimatedModal>
  );
}
