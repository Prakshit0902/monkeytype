import { z } from "zod";
import { RoomResultParticipantSchema } from "@monkeytype/schemas/room-results";
import {
  RoomConfigSchema,
  RoomParticipantSchema,
  RoomSnapshotSchema,
  RoomSubmissionSchema,
} from "@monkeytype/schemas/rooms";
import { IdSchema } from "@monkeytype/schemas/util";

export const RoomWsErrorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_ALREADY_STARTED",
  "ALREADY_IN_ANOTHER_ROOM",
  "RACE_IN_PROGRESS_OTHER_TAB",
  "DUPLICATE_CONNECTION",
  "NOT_HOST",
  "INVALID_CONFIG",
  "INVALID_STATE",
  "NOT_ENOUGH_PLAYERS",
  "PLAYERS_NOT_READY",
  "INVALID_SUBMISSION",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);
export type RoomWsErrorCode = z.infer<typeof RoomWsErrorCodeSchema>;

// Client -> Server messages

export const WsAuthMessageSchema = z
  .object({
    type: z.literal("auth"),
    token: z.string().min(1),
  })
  .strict();

export const WsJoinRoomMessageSchema = z
  .object({
    type: z.literal("join-room"),
    roomId: z.string().min(1),
  })
  .strict();

export const WsLeaveRoomMessageSchema = z
  .object({
    type: z.literal("leave-room"),
  })
  .strict();

export const WsUpdateConfigMessageSchema = z
  .object({
    type: z.literal("update-config"),
    config: RoomConfigSchema,
  })
  .strict();

export const WsSetReadyMessageSchema = z
  .object({
    type: z.literal("set-ready"),
    ready: z.boolean(),
  })
  .strict();

export const WsStartRaceMessageSchema = z
  .object({
    type: z.literal("start-race"),
  })
  .strict();

export const WsSubmitResultMessageSchema = z
  .object({
    type: z.literal("submit-result"),
    submission: RoomSubmissionSchema,
  })
  .strict();

export const WsResetRoomMessageSchema = z
  .object({
    type: z.literal("reset-room"),
  })
  .strict();

export const WsPingMessageSchema = z
  .object({
    type: z.literal("ping"),
    clientTime: z.number(),
  })
  .strict();

export const ClientRoomWsMessageSchema = z.discriminatedUnion("type", [
  WsAuthMessageSchema,
  WsJoinRoomMessageSchema,
  WsLeaveRoomMessageSchema,
  WsUpdateConfigMessageSchema,
  WsSetReadyMessageSchema,
  WsStartRaceMessageSchema,
  WsSubmitResultMessageSchema,
  WsResetRoomMessageSchema,
  WsPingMessageSchema,
]);
export type ClientRoomWsMessage = z.infer<typeof ClientRoomWsMessageSchema>;

// Server -> Client messages

export const WsHelloMessageSchema = z.object({
  type: z.literal("hello"),
  uid: IdSchema,
  serverTime: z.number().int().nonnegative(),
});

export const WsPongMessageSchema = z.object({
  type: z.literal("pong"),
  clientTime: z.number(),
  serverTime: z.number().int().nonnegative(),
});

export const WsRoomSnapshotMessageSchema = z.object({
  type: z.literal("room-snapshot"),
  snapshot: RoomSnapshotSchema,
});

export const WsParticipantJoinedMessageSchema = z.object({
  type: z.literal("participant-joined"),
  participant: RoomParticipantSchema,
});

export const WsParticipantLeftReasonSchema = z.enum([
  "left",
  "disconnected",
  "replaced",
]);
export type WsParticipantLeftReason = z.infer<
  typeof WsParticipantLeftReasonSchema
>;

export const WsParticipantLeftMessageSchema = z.object({
  type: z.literal("participant-left"),
  uid: IdSchema,
  newHostUid: IdSchema.nullable().optional(),
  reason: WsParticipantLeftReasonSchema,
});

export const WsConfigUpdatedMessageSchema = z.object({
  type: z.literal("config-updated"),
  config: RoomConfigSchema,
  resetReady: z.literal(true),
});

export const WsParticipantReadyMessageSchema = z.object({
  type: z.literal("participant-ready"),
  uid: IdSchema,
  ready: z.boolean(),
});

export const WsHostChangedMessageSchema = z.object({
  type: z.literal("host-changed"),
  hostUid: IdSchema.nullable(),
});

export const WsRaceCountdownMessageSchema = z.object({
  type: z.literal("race-countdown"),
  roundId: z.string().min(1),
  config: RoomConfigSchema,
  startsInMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  seed: z.string().optional(),
  quoteId: z.string().optional(),
  words: z.array(z.string()).optional(),
});

export const WsCountdownAbortedMessageSchema = z.object({
  type: z.literal("countdown-aborted"),
  reason: z.string(),
});

export const WsRaceStartedMessageSchema = z.object({
  type: z.literal("race-started"),
  roundId: z.string().min(1),
  serverTime: z.number().int().nonnegative(),
});

export const WsPlayerFinishedMessageSchema = z.object({
  type: z.literal("player-finished"),
  uid: IdSchema,
  status: z.enum(["finished", "dnf"]),
});

export const WsRaceFinishedMessageSchema = z.object({
  type: z.literal("race-finished"),
  roundId: z.string().min(1),
  standings: z.array(RoomResultParticipantSchema),
  newHostUid: IdSchema.nullable().optional(),
  persisted: z.boolean(),
});

export const WsRoomResetMessageSchema = z.object({
  type: z.literal("room-reset"),
  state: z.literal("idle"),
  hostUid: IdSchema.nullable(),
  participants: z.array(RoomParticipantSchema),
});

export const WsErrorMessageSchema = z.object({
  type: z.literal("error"),
  code: RoomWsErrorCodeSchema,
  message: z.string(),
});

export const ServerRoomWsMessageSchema = z.discriminatedUnion("type", [
  WsHelloMessageSchema,
  WsPongMessageSchema,
  WsRoomSnapshotMessageSchema,
  WsParticipantJoinedMessageSchema,
  WsParticipantLeftMessageSchema,
  WsConfigUpdatedMessageSchema,
  WsParticipantReadyMessageSchema,
  WsHostChangedMessageSchema,
  WsRaceCountdownMessageSchema,
  WsCountdownAbortedMessageSchema,
  WsRaceStartedMessageSchema,
  WsPlayerFinishedMessageSchema,
  WsRaceFinishedMessageSchema,
  WsRoomResetMessageSchema,
  WsErrorMessageSchema,
]);
export type ServerRoomWsMessage = z.infer<typeof ServerRoomWsMessageSchema>;
