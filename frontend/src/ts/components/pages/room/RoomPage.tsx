import { useParams } from "@tanstack/solid-router";
import { createMemo, JSXElement, Show } from "solid-js";

import {
  showErrorNotification,
  showSuccessNotification,
} from "../../../states/notifications";
import { Button } from "../../common/Button";
import { Fa } from "../../common/Fa";
import {
  ROOM_PREVIEW_LEGACY_PREFIX,
  ROOM_PREVIEW_STORAGE_KEY,
  RoomPreviewCache,
  RoomPreviewCacheSchema,
} from "../../modals/RoomEntryModal";

function readPreviewFromKey(
  storageKey: string,
  expectedRoomId: string,
): RoomPreviewCache | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw === null) return null;

    const parsed = RoomPreviewCacheSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      sessionStorage.removeItem(storageKey);
      return null;
    }

    const preview = parsed.data;
    if (preview.expiresAt !== undefined && preview.expiresAt <= Date.now()) {
      sessionStorage.removeItem(storageKey);
      return null;
    }

    if (preview.roomId !== expectedRoomId) {
      return null;
    }

    return preview;
  } catch {
    sessionStorage.removeItem(storageKey);
    return null;
  }
}

function readRoomPreview(roomId: string): RoomPreviewCache | null {
  return (
    readPreviewFromKey(ROOM_PREVIEW_STORAGE_KEY, roomId) ??
    readPreviewFromKey(`${ROOM_PREVIEW_LEGACY_PREFIX}${roomId}`, roomId)
  );
}

export function RoomPage(): JSXElement {
  const params = useParams({ from: "/userData/room/$roomId" });
  const roomId = () => params().roomId;
  const preview = createMemo(() => readRoomPreview(roomId()));
  const inviteUrl = () => `${window.location.origin}/room/${roomId()}`;

  const copyText = (value: string, label: string): void => {
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        showSuccessNotification(`${label} copied to clipboard`);
      })
      .catch((error: unknown) => {
        showErrorNotification(`Failed to copy ${label.toLowerCase()}`, {
          error,
        });
      });
  };

  return (
    <div class="content-grid grid gap-6">
      <div class="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-sub-alt p-6">
        <div class="grid gap-1">
          <div class="flex items-center gap-2 text-2xl font-semibold text-text">
            <Fa icon="fa-flag-checkered" class="text-main" />
            <span>Competitive Room</span>
          </div>
          <div class="font-mono text-xs text-sub">ID: {roomId()}</div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Show when={preview()?.code}>
            {(code) => (
              <Button
                text={`Code: ${code()}`}
                fa={{ icon: "fa-copy" }}
                onClick={() => copyText(code(), "Invite code")}
              />
            )}
          </Show>
          <Button
            text="Copy invite link"
            fa={{ icon: "fa-copy" }}
            onClick={() => copyText(inviteUrl(), "Invite link")}
          />
        </div>
      </div>

      <Show when={preview()?.config}>
        {(config) => (
          <div class="flex flex-wrap items-center gap-4 rounded-lg bg-sub-alt/60 px-6 py-4 text-sm text-sub">
            <span>
              Mode:{" "}
              <strong class="text-text">
                {config().mode} {config().mode2}
              </strong>
            </span>
            <span>
              Language: <strong class="text-text">{config().language}</strong>
            </span>
            <span>
              Max players:{" "}
              <strong class="text-text">{config().maxPlayers}</strong>
            </span>
          </div>
        )}
      </Show>

      <div class="flex items-center justify-center gap-3 rounded-lg bg-sub-alt/40 p-10 text-sub">
        <Fa icon="fa-circle-notch" spin={true} class="text-main" />
        <span>Connecting to room...</span>
      </div>
    </div>
  );
}
