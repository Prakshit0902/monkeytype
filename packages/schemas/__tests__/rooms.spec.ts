import { describe, expect, it } from "vitest";
import {
  RoomConfigSchema,
  RoomSnapshotSchema,
  RoomSubmissionSchema,
} from "@monkeytype/schemas/rooms";
import { RoomResultSchema } from "@monkeytype/schemas/room-results";

const baseRoomConfig = {
  mode: "time" as const,
  mode2: "60",
  language: "english" as const,
  punctuation: false,
  numbers: false,
  difficulty: "normal" as const,
  stopOnError: "off" as const,
  maxPlayers: 10,
};

const baseSubmission = {
  roundId: "round_123",
  wpm: 112.5,
  rawWpm: 118.2,
  acc: 97.4,
  consistency: 84.1,
  keyConsistency: 81.3,
  charStats: [250, 4, 0, 2] as [number, number, number, number],
  testDuration: 60,
  mode: "time" as const,
  mode2: "60",
  language: "english" as const,
  punctuation: false,
  numbers: false,
  difficulty: "normal" as const,
  startToFirstKey: 120,
  lastKeyToEnd: 85,
  wpmConsistency: 82.0,
  chartData: {
    wpm: [110, 115],
    burst: [112, 118],
    err: [0, 1],
  },
};

describe("rooms schemas", () => {
  describe("RoomConfigSchema", () => {
    it("accepts valid time, words, quote, and finite custom configs", () => {
      expect(RoomConfigSchema.safeParse(baseRoomConfig).success).toBe(true);
      expect(
        RoomConfigSchema.safeParse({
          ...baseRoomConfig,
          mode: "words",
          mode2: "50",
        }).success,
      ).toBe(true);
      expect(
        RoomConfigSchema.safeParse({
          ...baseRoomConfig,
          mode: "quote",
          mode2: "123",
        }).success,
      ).toBe(true);
      expect(
        RoomConfigSchema.safeParse({
          ...baseRoomConfig,
          mode: "custom",
          mode2: "custom",
          customText: {
            text: ["hello", "world"],
            mode: "repeat",
            pipeDelimiter: false,
            limit: { mode: "word", value: 25 },
          },
        }).success,
      ).toBe(true);
    });

    it('rejects "zen" mode and "zen" mode2', () => {
      expect(
        RoomConfigSchema.safeParse({
          ...baseRoomConfig,
          mode: "zen",
          mode2: "zen",
        }).success,
      ).toBe(false);

      expect(
        RoomConfigSchema.safeParse({
          ...baseRoomConfig,
          mode: "time",
          mode2: "zen",
        }).success,
      ).toBe(false);
    });

    it("rejects custom mode without customText or without finite limit", () => {
      expect(
        RoomConfigSchema.safeParse({
          ...baseRoomConfig,
          mode: "custom",
          mode2: "custom",
        }).success,
      ).toBe(false);

      expect(
        RoomConfigSchema.safeParse({
          ...baseRoomConfig,
          mode: "custom",
          mode2: "custom",
          customText: {
            text: ["hello", "world"],
            mode: "repeat",
            pipeDelimiter: false,
            limit: { mode: "word", value: 0 },
          },
        }).success,
      ).toBe(false);
    });

    it("rejects infinite time/words (0) and invalid maxPlayers", () => {
      expect(
        RoomConfigSchema.safeParse({
          ...baseRoomConfig,
          mode: "time",
          mode2: "0",
        }).success,
      ).toBe(false);

      expect(
        RoomConfigSchema.safeParse({
          ...baseRoomConfig,
          maxPlayers: 1,
        }).success,
      ).toBe(false);

      expect(
        RoomConfigSchema.safeParse({
          ...baseRoomConfig,
          maxPlayers: 21,
        }).success,
      ).toBe(false);
    });
  });

  describe("RoomSnapshotSchema", () => {
    it("accepts nullable creatorUid and hostUid for matchmade rooms", () => {
      const parsed = RoomSnapshotSchema.safeParse({
        roomId: "room_abc",
        code: "ABCD1234",
        type: "matchmade",
        state: "idle",
        creatorUid: null,
        hostUid: null,
        config: baseRoomConfig,
        participants: [
          {
            uid: "user_1",
            name: "racer1",
            joinedAt: 1700000000000,
            ready: false,
            status: "joined",
          },
        ],
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe("RoomSubmissionSchema", () => {
    it("accepts valid submission and enforces acc >= 50", () => {
      expect(RoomSubmissionSchema.safeParse(baseSubmission).success).toBe(true);
      expect(
        RoomSubmissionSchema.safeParse({
          ...baseSubmission,
          acc: 49.9,
        }).success,
      ).toBe(false);
    });

    it("rejects unknown extra properties due to strict mode", () => {
      expect(
        RoomSubmissionSchema.safeParse({
          ...baseSubmission,
          extraField: true,
        }).success,
      ).toBe(false);
    });
  });

  describe("RoomResultSchema", () => {
    it("validates completed room results with finishers and DNFs", () => {
      const parsed = RoomResultSchema.safeParse({
        _id: "res_1",
        roomId: "room_abc",
        roundId: "round_123",
        roomType: "private",
        creatorUid: "user_1",
        config: baseRoomConfig,
        startedAt: 1700000000000,
        endedAt: 1700000060000,
        participantCount: 2,
        finisherCount: 1,
        participants: [
          {
            uid: "user_1",
            name: "racer1",
            rank: 1,
            status: "finished",
            wpm: 112.5,
            rawWpm: 118.2,
            acc: 97.4,
            consistency: 84.1,
            keyConsistency: 81.3,
            charStats: [250, 4, 0, 2],
            testDuration: 60,
            finishedAt: 1700000059500,
          },
          {
            uid: "user_2",
            name: "racer2",
            rank: null,
            status: "dnf",
            wpm: null,
            rawWpm: null,
            acc: null,
            consistency: null,
            keyConsistency: null,
            charStats: null,
            testDuration: null,
            finishedAt: null,
          },
        ],
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects 0 finishers or < 2 participants", () => {
      const baseResult = {
        _id: "res_1",
        roomId: "room_abc",
        roundId: "round_123",
        roomType: "private",
        creatorUid: "user_1",
        config: baseRoomConfig,
        startedAt: 1700000000000,
        endedAt: 1700000060000,
        participantCount: 2,
        finisherCount: 0,
        participants: [],
      };
      expect(RoomResultSchema.safeParse(baseResult).success).toBe(false);
      expect(
        RoomResultSchema.safeParse({
          ...baseResult,
          participantCount: 1,
          finisherCount: 1,
        }).success,
      ).toBe(false);
    });
  });
});
