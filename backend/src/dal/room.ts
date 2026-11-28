import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  RoomConfig,
  RoomConfigSchema,
  RoomState,
  RoomStateSchema,
  RoomType,
  RoomTypeSchema,
} from "@monkeytype/schemas/rooms";
import { parseWithSchema as parseJsonWithSchema } from "@monkeytype/util/json";
import * as RedisClient from "../init/redis";
import type { RedisConnectionWithCustomMethods } from "../init/redis";
import MonkeyError from "../utils/error";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 8;
const MAX_CODE_RETRIES = 5;

export function roomMetaKey(roomId: string): string {
  return `room:${roomId}:meta`;
}

export function roomParticipantsKey(roomId: string): string {
  return `room:${roomId}:participants`;
}

export function roomOrderKey(roomId: string): string {
  return `room:${roomId}:order`;
}

export function roomCodeKey(code: string): string {
  return `roomcode:${code.trim().toUpperCase()}`;
}

export function userActiveRoomKey(uid: string): string {
  return `user:${uid}:activeRoom`;
}

export type RoomMeta = {
  roomId: string;
  code: string;
  type: RoomType;
  creatorUid: string | null;
  hostUid: string | null;
  state: RoomState;
  config: RoomConfig;
  roundId: string;
  roundSeed: string;
  quoteId: string;
  roundStartTime: number;
  endTime: number;
  starterCount: number;
  createdAt: number;
  updatedAt: number;
};

export type RoomMetaWithCount = RoomMeta & {
  participantCount: number;
};

function requireRedis(): RedisConnectionWithCustomMethods {
  if (!RedisClient.isConnected()) {
    throw new MonkeyError(503, "Competitive rooms require Redis");
  }
  const connection = RedisClient.getConnection();
  if (connection === null) {
    throw new MonkeyError(503, "Competitive rooms require Redis");
  }
  return connection;
}

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[crypto.randomInt(0, ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function parseRoomMetaHash(raw: Record<string, string>): RoomMeta | null {
  if (Object.keys(raw).length === 0 || raw["roomId"] === undefined) {
    return null;
  }

  const configJson = raw["config"];
  if (configJson === undefined) {
    return null;
  }

  const config = parseJsonWithSchema(configJson, RoomConfigSchema);
  const type = RoomTypeSchema.parse(raw["type"]);
  const state = RoomStateSchema.parse(raw["state"]);

  return {
    roomId: raw["roomId"],
    code: raw["code"] ?? "",
    type,
    creatorUid:
      raw["creatorUid"] !== undefined && raw["creatorUid"] !== ""
        ? raw["creatorUid"]
        : null,
    hostUid:
      raw["hostUid"] !== undefined && raw["hostUid"] !== ""
        ? raw["hostUid"]
        : null,
    state,
    config,
    roundId: raw["roundId"] ?? "",
    roundSeed: raw["roundSeed"] ?? "",
    quoteId: raw["quoteId"] ?? "",
    roundStartTime: Number(raw["roundStartTime"] ?? 0),
    endTime: Number(raw["endTime"] ?? 0),
    starterCount: Number(raw["starterCount"] ?? 0),
    createdAt: Number(raw["createdAt"] ?? 0),
    updatedAt: Number(raw["updatedAt"] ?? 0),
  };
}

export async function createRoom(options: {
  uid: string;
  config: RoomConfig;
  emptyRoomTtlSeconds: number;
}): Promise<{
  roomId: string;
  code: string;
  config: RoomConfig;
  expiresAt: number;
}> {
  const connection = requireRedis();
  const { uid, config, emptyRoomTtlSeconds } = options;
  const configJson = JSON.stringify(config);

  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const roomId = uuidv4();
    const code = generateRoomCode();
    const now = Date.now();

    const [ok, reason] = await connection.roomCreate(
      3,
      roomMetaKey(roomId),
      roomCodeKey(code),
      userActiveRoomKey(uid),
      roomId,
      code,
      uid,
      configJson,
      String(now),
      String(emptyRoomTtlSeconds),
    );

    if (ok === 1) {
      return {
        roomId,
        code,
        config,
        expiresAt: now + emptyRoomTtlSeconds * 1000,
      };
    }

    if (reason === "ALREADY_IN_ROOM") {
      throw new MonkeyError(409, "You already have an active room");
    }

    if (reason !== "CODE_COLLISION" && reason !== "ROOM_EXISTS") {
      throw new MonkeyError(500, `Failed to create room: ${reason}`);
    }
  }

  throw new MonkeyError(
    500,
    "Failed to allocate a unique room code. Please try again.",
  );
}

export async function getRoomMetaById(
  roomId: string,
): Promise<RoomMetaWithCount | null> {
  const connection = requireRedis();

  const pipelineResults = await connection
    .pipeline()
    .hgetall(roomMetaKey(roomId))
    .hlen(roomParticipantsKey(roomId))
    .exec();

  if (pipelineResults === null) {
    throw new MonkeyError(503, "Competitive rooms require Redis");
  }

  const [metaErr, metaValue] = pipelineResults[0] ?? [];
  const [countErr, countValue] = pipelineResults[1] ?? [];
  if (metaErr !== null && metaErr !== undefined) {
    throw metaErr;
  }
  if (countErr !== null && countErr !== undefined) {
    throw countErr;
  }

  const rawMeta = (metaValue ?? {}) as Record<string, string>;
  const participantCount = Number(countValue ?? 0);

  const parsed = parseRoomMetaHash(rawMeta);
  if (parsed === null) {
    return null;
  }

  return {
    ...parsed,
    participantCount,
  };
}

export async function getRoomMetaByCode(
  code: string,
): Promise<RoomMetaWithCount | null> {
  const connection = requireRedis();
  const roomId = await connection.get(roomCodeKey(code));
  if (roomId === null || roomId === "") {
    return null;
  }

  return await getRoomMetaById(roomId);
}
