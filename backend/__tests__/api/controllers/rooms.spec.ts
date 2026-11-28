import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { Test as SuperTest } from "supertest";
import type { Configuration as ServerConfiguration } from "@monkeytype/schemas/configuration";
import { createMockApp } from "../../__testData__/controller-test";
import {
  mockAuthenticateWithApeKey,
  mockBearerAuthentication,
} from "../../__testData__/auth";
import * as Configuration from "../../../src/init/configuration";
import * as RoomDal from "../../../src/dal/room";
import * as UserDal from "../../../src/dal/user";
import MonkeyError from "../../../src/utils/error";

const mockApp = createMockApp();
const configuration = Configuration.getCachedConfiguration();
const uid = new ObjectId().toHexString();
const mockAuth = mockBearerAuthentication(uid);

const validRoomConfig = {
  mode: "time" as const,
  mode2: "60",
  language: "english" as const,
  punctuation: false,
  numbers: false,
  difficulty: "normal" as const,
  stopOnError: "off" as const,
  maxPlayers: 5,
};

let getCachedConfigurationSpy: { mockRestore: () => void } | undefined;

async function configureRooms(
  overrides: Partial<ServerConfiguration["rooms"]> = {},
  apeKeysEnabled = false,
): Promise<ServerConfiguration> {
  const mockConfig = structuredClone(await configuration);
  mockConfig.rooms = {
    ...mockConfig.rooms,
    enabled: true,
    maxPlayersPerRoom: 10,
    validModeRules: [],
    ...overrides,
  };
  if (apeKeysEnabled) {
    mockConfig.apeKeys = {
      ...mockConfig.apeKeys,
      endpointsEnabled: true,
      acceptKeys: true,
      apeKeyBytes: 24,
      apeKeySaltRounds: 5,
    };
  }

  getCachedConfigurationSpy?.mockRestore();
  getCachedConfigurationSpy = vi
    .spyOn(Configuration, "getCachedConfiguration")
    .mockResolvedValue(mockConfig);
  return mockConfig;
}

async function expectFailForDisabledEndpoint(call: SuperTest): Promise<void> {
  await configureRooms({ enabled: false });
  const { body } = await call.expect(503);
  expect(body.message).toEqual(
    "Competitive rooms are not available at this time.",
  );
}

describe("RoomsController", () => {
  const getPartialUserMock = vi.spyOn(UserDal, "getPartialUser");

  beforeEach(async () => {
    await configureRooms();
    mockAuth.beforeEach();
    getPartialUserMock.mockReset();
    getPartialUserMock.mockResolvedValue({ uid, banned: false } as any);
  });

  afterEach(() => {
    getCachedConfigurationSpy?.mockRestore();
    getCachedConfigurationSpy = undefined;
  });

  describe("createRoom (POST /rooms)", () => {
    const createRoomMock = vi.spyOn(RoomDal, "createRoom");

    beforeEach(() => {
      createRoomMock.mockReset();
    });

    it("creates a room and returns 201", async () => {
      const created = {
        roomId: "room-uuid-1",
        code: "ABCD1234",
        config: validRoomConfig,
        expiresAt: 1700000120000,
      };
      createRoomMock.mockResolvedValue(created);

      const { body } = await mockApp
        .post("/rooms")
        .send({ config: validRoomConfig })
        .set("Authorization", `Bearer ${uid}`)
        .expect(201);

      expect(body.data).toEqual(created);
      expect(createRoomMock).toHaveBeenCalledWith({
        uid,
        config: validRoomConfig,
        emptyRoomTtlSeconds: 120,
      });
    });

    it("rejects unauthenticated requests", async () => {
      await mockApp
        .post("/rooms")
        .send({ config: validRoomConfig })
        .expect(401);
    });

    it("rejects disabled rooms configuration with 503", async () => {
      await expectFailForDisabledEndpoint(
        mockApp
          .post("/rooms")
          .send({ config: validRoomConfig })
          .set("Authorization", `Bearer ${uid}`),
      );
    });

    it("rejects banned users with 403", async () => {
      getPartialUserMock.mockResolvedValue({ uid, banned: true } as any);

      const { body } = await mockApp
        .post("/rooms")
        .send({ config: validRoomConfig })
        .set("Authorization", `Bearer ${uid}`)
        .expect(403);

      expect(body.message).toEqual("Banned users cannot create rooms");
      expect(createRoomMock).not.toHaveBeenCalled();
    });

    it("rejects maxPlayers exceeding server limit with 422", async () => {
      await configureRooms({ maxPlayersPerRoom: 4 });

      const { body } = await mockApp
        .post("/rooms")
        .send({ config: { ...validRoomConfig, maxPlayers: 5 } })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body.message).toEqual("maxPlayers cannot exceed 4");
      expect(createRoomMock).not.toHaveBeenCalled();
    });

    it("validates config against validModeRules when non-empty", async () => {
      await configureRooms({
        validModeRules: [
          { language: "english", mode: "time", mode2: "(15|60)" },
        ],
      });

      const { body } = await mockApp
        .post("/rooms")
        .send({ config: { ...validRoomConfig, mode2: "30" } })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body.message).toEqual(
        "Room configuration is not allowed by server rules",
      );
      expect(createRoomMock).not.toHaveBeenCalled();
    });

    it("propagates 409 when user already has an active room", async () => {
      createRoomMock.mockRejectedValue(
        new MonkeyError(409, "You already have an active room"),
      );

      const { body } = await mockApp
        .post("/rooms")
        .send({ config: validRoomConfig })
        .set("Authorization", `Bearer ${uid}`)
        .expect(409);

      expect(body.message).toEqual("You already have an active room");
    });

    it("rejects invalid schema payloads like zen mode", async () => {
      await mockApp
        .post("/rooms")
        .send({
          config: { ...validRoomConfig, mode: "zen", mode2: "zen" },
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);
    });

    it("rejects oversized customText.text payloads (Redis/PubSub DoS protection)", async () => {
      // ~65 KB JSON payload: fits under Express's default 100 KB json() limit
      // so it reaches RoomConfigSchema / createRoom without a 413.
      const bloatedWords = Array.from({ length: 5000 }, () => "word123456");
      const customConfig = {
        ...validRoomConfig,
        mode: "custom" as const,
        mode2: "custom",
        customText: {
          text: bloatedWords,
          mode: "repeat" as const,
          pipeDelimiter: false,
          limit: { mode: "word" as const, value: 50 },
        },
      };
      createRoomMock.mockResolvedValue({
        roomId: "room-bloated",
        code: "BLOAT123",
        config: customConfig,
        expiresAt: 1700000120000,
      });

      await mockApp
        .post("/rooms")
        .send({ config: customConfig })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(createRoomMock).not.toHaveBeenCalled();
    });

    it("rejects ApeKey authentication with 401", async () => {
      const configWithApeKeys = await configureRooms({}, true);
      const apeKey = await mockAuthenticateWithApeKey(uid, configWithApeKeys);

      const { body } = await mockApp
        .post("/rooms")
        .send({ config: validRoomConfig })
        .set("Authorization", `ApeKey ${apeKey}`)
        .expect(401);

      expect(body.message).toEqual("This endpoint does not accept ApeKeys");
      expect(createRoomMock).not.toHaveBeenCalled();
    });

    it("returns 503 when Redis is disconnected", async () => {
      createRoomMock.mockRejectedValue(
        new MonkeyError(503, "Competitive rooms require Redis"),
      );

      const { body } = await mockApp
        .post("/rooms")
        .send({ config: validRoomConfig })
        .set("Authorization", `Bearer ${uid}`)
        .expect(503);

      expect(body.message).toEqual("Competitive rooms require Redis");
    });
  });

  describe("getRoomByCode (GET /rooms/code/:code)", () => {
    const getRoomMetaByCodeMock = vi.spyOn(RoomDal, "getRoomMetaByCode");

    beforeEach(() => {
      getRoomMetaByCodeMock.mockReset();
    });

    it("returns room metadata for valid invite code", async () => {
      getRoomMetaByCodeMock.mockResolvedValue({
        roomId: "room-uuid-1",
        code: "ABCD1234",
        type: "private",
        creatorUid: uid,
        hostUid: uid,
        state: "idle",
        config: validRoomConfig,
        roundId: "",
        roundSeed: "",
        quoteId: "",
        roundStartTime: 0,
        endTime: 0,
        starterCount: 0,
        createdAt: 1000,
        updatedAt: 1000,
        participantCount: 2,
      });

      const { body } = await mockApp
        .get("/rooms/code/ABCD1234")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      expect(body.data).toEqual({
        roomId: "room-uuid-1",
        code: "ABCD1234",
        state: "idle",
        participantCount: 2,
        maxPlayers: validRoomConfig.maxPlayers,
        config: validRoomConfig,
      });
    });

    it("returns 404 when room code does not exist", async () => {
      getRoomMetaByCodeMock.mockResolvedValue(null);

      const { body } = await mockApp
        .get("/rooms/code/NOTFOUND")
        .set("Authorization", `Bearer ${uid}`)
        .expect(404);

      expect(body.message).toEqual("Room not found");
    });

    it("rejects banned users with 403", async () => {
      getPartialUserMock.mockResolvedValue({ uid, banned: true } as any);

      await mockApp
        .get("/rooms/code/ABCD1234")
        .set("Authorization", `Bearer ${uid}`)
        .expect(403);
    });

    it("rejects disabled rooms configuration with 503", async () => {
      await expectFailForDisabledEndpoint(
        mockApp
          .get("/rooms/code/ABCD1234")
          .set("Authorization", `Bearer ${uid}`),
      );
    });

    it("rejects invalid invite code path parameters with 422", async () => {
      await mockApp
        .get("/rooms/code/AB")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      await mockApp
        .get("/rooms/code/BAD!CODE")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(getRoomMetaByCodeMock).not.toHaveBeenCalled();
    });
  });
});
