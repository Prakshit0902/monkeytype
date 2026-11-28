import { z } from "zod";
import { StopOnErrorSchema } from "./configs";
import { LanguageSchema } from "./languages";
import {
  ChartDataSchema,
  CharStatsSchema,
  CustomTextSettingsSchema,
} from "./results";
import { DifficultySchema, Mode2Schema } from "./shared";
import { IdSchema, PercentageSchema, WpmSchema } from "./util";

export const RoomTypeSchema = z.enum(["private", "matchmade"]);
export type RoomType = z.infer<typeof RoomTypeSchema>;

// the restarting state needs to be checked but keeping it for now
export const RoomStateSchema = z.enum([
  "idle",
  "countdown",
  "competing",
  "finished",
  "restarting",
]);
export type RoomState = z.infer<typeof RoomStateSchema>;

export const RoomModeSchema = z.enum(["time", "words", "quote", "custom"]);
export type RoomMode = z.infer<typeof RoomModeSchema>;

export const MAX_ROOM_CUSTOM_TEXT_WORDS = 1000;
export const MAX_ROOM_CUSTOM_TEXT_CHARS = 10_000;

export const RoomConfigSchema = z
  .object({
    mode: RoomModeSchema,
    mode2: Mode2Schema,
    language: LanguageSchema,
    punctuation: z.boolean(),
    numbers: z.boolean(),
    difficulty: DifficultySchema.default("normal"),
    stopOnError: StopOnErrorSchema.default("off"),
    maxPlayers: z.number().int().min(2).max(20),
    customText: CustomTextSettingsSchema.optional(),
  })
  .superRefine((config, ctx) => {
    if (config.mode2 === "zen") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mode2"],
        message: 'Mode2 cannot be "zen" in competitive rooms',
      });
    }

    if (config.mode === "custom") {
      if (config.mode2 !== "custom") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mode2"],
          message: 'Mode2 must be "custom" when mode is "custom"',
        });
      }
      if (config.customText === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customText"],
          message: 'customText is required when mode is "custom"',
        });
      }
    } else if (config.mode2 === "custom") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mode2"],
        message: 'Mode2 "custom" is only valid when mode is "custom"',
      });
    }

    if (
      (config.mode === "time" || config.mode === "words") &&
      (!/^\d+$/.test(config.mode2) || parseInt(config.mode2, 10) <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mode2"],
        message: `Mode "${config.mode}" requires a positive numeric mode2`,
      });
    }

    if (config.customText !== undefined) {
      if (config.customText.limit.value <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customText", "limit", "value"],
          message: "Custom text must have a finite positive limit",
        });
      }

      if (config.customText.text.length > MAX_ROOM_CUSTOM_TEXT_WORDS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customText", "text"],
          message: `Custom text cannot exceed ${MAX_ROOM_CUSTOM_TEXT_WORDS} words`,
        });
      }

      const totalChars = config.customText.text.reduce(
        (sum, word) => sum + word.length,
        0,
      );
      if (totalChars > MAX_ROOM_CUSTOM_TEXT_CHARS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customText", "text"],
          message: `Custom text cannot exceed ${MAX_ROOM_CUSTOM_TEXT_CHARS} characters`,
        });
      }
    }
  });
export type RoomConfig = z.infer<typeof RoomConfigSchema>;

export const ParticipantStatusSchema = z.enum([
  "joined",
  "ready",
  "competing",
  "finished",
  "dnf",
]);
export type ParticipantStatus = z.infer<typeof ParticipantStatusSchema>;

export const RoomParticipantSchema = z.object({
  uid: IdSchema,
  name: z.string(),
  joinedAt: z.number().int().nonnegative(),
  ready: z.boolean(),
  status: ParticipantStatusSchema,
});
export type RoomParticipant = z.infer<typeof RoomParticipantSchema>;

export const RoomSnapshotSchema = z.object({
  roomId: z.string().min(1),
  code: z.string().min(1),
  type: RoomTypeSchema,
  state: RoomStateSchema,
  creatorUid: IdSchema.nullable(),
  hostUid: IdSchema.nullable(),
  config: RoomConfigSchema,
  participants: z.array(RoomParticipantSchema),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;

export const RoomSubmissionSchema = z
  .object({
    roundId: z.string().min(1),
    wpm: WpmSchema,
    rawWpm: WpmSchema,
    acc: PercentageSchema.min(50),
    consistency: PercentageSchema,
    keyConsistency: PercentageSchema,
    charStats: CharStatsSchema,
    testDuration: z.number().min(1),
    mode: RoomModeSchema,
    mode2: Mode2Schema,
    language: LanguageSchema,
    punctuation: z.boolean(),
    numbers: z.boolean(),
    difficulty: DifficultySchema,
    startToFirstKey: z.number().nonnegative(),
    lastKeyToEnd: z.number().nonnegative(),
    wpmConsistency: PercentageSchema,
    chartData: ChartDataSchema.or(z.literal("toolong")),
  })
  .strict();
export type RoomSubmission = z.infer<typeof RoomSubmissionSchema>;
