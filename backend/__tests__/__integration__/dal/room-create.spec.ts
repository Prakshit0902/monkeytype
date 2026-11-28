import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import * as RoomDal from "../../../src/dal/room";
import { getConnection } from "../../../src/init/redis";
import { cleanupKeys, redisSetup } from "../redis";

const baseConfig = {
  mode: "time" as const,
  mode2: "60",
  language: "english" as const,
  punctuation: false,
  numbers: false,
  difficulty: "normal" as const,
  stopOnError: "off" as const,
  maxPlayers: 5,
};

describe("RoomDal (room-create)", () => {
  beforeAll(async () => {
    await redisSetup();
  });

  afterEach(async () => {
    await cleanupKeys("room:");
    await cleanupKeys("roomcode:");
    await cleanupKeys("user:");
  });

  it("allocates room metadata, code lookup, activeRoom key, and TTL without adding creator to participants", async () => {
    const uid = new ObjectId().toHexString();
    const created = await RoomDal.createRoom({
      uid,
      config: baseConfig,
      emptyRoomTtlSeconds: 120,
    });

    expect(created.roomId).toBeTruthy();
    expect(created.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(created.config).toEqual(baseConfig);

    const conn = getConnection();
    if (conn === null) {
      throw new Error("Redis connection not initialized");
    }
    const [metaTtl, codeTtl, activeRoomTtl, participantCount] =
      await Promise.all([
        conn.ttl(RoomDal.roomMetaKey(created.roomId)),
        conn.ttl(RoomDal.roomCodeKey(created.code)),
        conn.ttl(RoomDal.userActiveRoomKey(uid)),
        conn.hlen(RoomDal.roomParticipantsKey(created.roomId)),
      ]);

    expect(metaTtl).toBeGreaterThan(0);
    expect(metaTtl).toBeLessThanOrEqual(120);
    expect(codeTtl).toBeGreaterThan(0);
    expect(codeTtl).toBeLessThanOrEqual(120);
    expect(activeRoomTtl).toBeGreaterThan(0);
    expect(activeRoomTtl).toBeLessThanOrEqual(120);
    expect(participantCount).toBe(0);

    const byCode = await RoomDal.getRoomMetaByCode(created.code.toLowerCase());
    expect(byCode).toMatchObject({
      roomId: created.roomId,
      code: created.code,
      type: "private",
      creatorUid: uid,
      hostUid: uid,
      state: "idle",
      participantCount: 0,
      config: baseConfig,
    });
  });

  it("rejects creating a second active room for the same user (409)", async () => {
    const uid = new ObjectId().toHexString();

    await RoomDal.createRoom({
      uid,
      config: baseConfig,
      emptyRoomTtlSeconds: 120,
    });

    await expect(
      RoomDal.createRoom({
        uid,
        config: baseConfig,
        emptyRoomTtlSeconds: 120,
      }),
    ).rejects.toThrow("You already have an active room");
  });

  it("returns null for unknown invite codes", async () => {
    const result = await RoomDal.getRoomMetaByCode("UNKNOWN1");
    expect(result).toBeNull();
  });

  it("allows only one room on concurrent createRoom calls for the same uid", async () => {
    const uid = new ObjectId().toHexString();

    const results = await Promise.allSettled([
      RoomDal.createRoom({
        uid,
        config: baseConfig,
        emptyRoomTtlSeconds: 120,
      }),
      RoomDal.createRoom({
        uid,
        config: baseConfig,
        emptyRoomTtlSeconds: 120,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      status: 409,
      message: "You already have an active room",
    });
  });

  it("allows creating a new room when user activeRoom points to an expired room", async () => {
    const uid = new ObjectId().toHexString();
    const conn = getConnection();
    if (conn === null) {
      throw new Error("Redis connection not initialized");
    }

    await conn.set(RoomDal.userActiveRoomKey(uid), "expired-room-id", "EX", 60);

    const created = await RoomDal.createRoom({
      uid,
      config: baseConfig,
      emptyRoomTtlSeconds: 120,
    });

    expect(created.roomId).toBeTruthy();
    expect(await conn.get(RoomDal.userActiveRoomKey(uid))).toBe(created.roomId);
  });
});
