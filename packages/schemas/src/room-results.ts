import { z } from "zod";
import { CharStatsSchema } from "./results";
import { RoomConfigSchema, RoomTypeSchema } from "./rooms";
import { IdSchema, PercentageSchema, WpmSchema } from "./util";

export const RoomResultParticipantSchema = z.object({
  uid: IdSchema,
  name: z.string(),
  rank: z.number().int().positive().nullable(),
  status: z.enum(["finished", "dnf"]),
  wpm: WpmSchema.nullable(),
  rawWpm: WpmSchema.nullable(),
  acc: PercentageSchema.nullable(),
  consistency: PercentageSchema.nullable(),
  keyConsistency: PercentageSchema.nullable(),
  charStats: CharStatsSchema.nullable(),
  testDuration: z.number().min(1).nullable(),
  finishedAt: z.number().int().nonnegative().nullable(),
});
export type RoomResultParticipant = z.infer<typeof RoomResultParticipantSchema>;

export const RoomResultSchema = z.object({
  _id: IdSchema,
  roomId: z.string().min(1),
  roundId: z.string().min(1),
  roomType: RoomTypeSchema,
  creatorUid: IdSchema.nullable(),
  config: RoomConfigSchema,
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative(),
  participantCount: z.number().int().min(2),
  finisherCount: z.number().int().min(1),
  participants: z.array(RoomResultParticipantSchema),
});
export type RoomResult = z.infer<typeof RoomResultSchema>;
