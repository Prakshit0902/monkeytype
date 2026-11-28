import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { RoomConfigSchema, RoomStateSchema } from "@monkeytype/schemas/rooms";
import {
  CommonResponses,
  meta,
  MonkeyClientError,
  responseWithData,
} from "./util/api";

const c = initContract();

export const CreateRoomRequestSchema = z.object({
  config: RoomConfigSchema,
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const CreateRoomDataSchema = z.object({
  roomId: z.string().min(1),
  code: z.string().min(1),
  config: RoomConfigSchema,
  expiresAt: z.number().int().nonnegative(),
});
export type CreateRoomData = z.infer<typeof CreateRoomDataSchema>;

export const CreateRoomResponseSchema = responseWithData(CreateRoomDataSchema);
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;

export const GetRoomByCodePathParamsSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4,16}$/, "Invalid room invite code"),
});
export type GetRoomByCodePathParams = z.infer<
  typeof GetRoomByCodePathParamsSchema
>;

export const GetRoomByCodeDataSchema = z.object({
  roomId: z.string().min(1),
  code: z.string().min(1),
  state: RoomStateSchema,
  participantCount: z.number().int().nonnegative(),
  maxPlayers: z.number().int().min(2).max(20),
  config: RoomConfigSchema,
});
export type GetRoomByCodeData = z.infer<typeof GetRoomByCodeDataSchema>;

export const GetRoomByCodeResponseSchema = responseWithData(
  GetRoomByCodeDataSchema,
);
export type GetRoomByCodeResponse = z.infer<typeof GetRoomByCodeResponseSchema>;

/**
 * WebSocket authentication uses a first-frame `{ type: "auth", token }` message
 * carrying the Firebase ID token (see `./room-ws.ts`), avoiding JWTs in URL query strings.
 */
export const roomsContract = c.router(
  {
    create: {
      summary: "create competitive room",
      description: "Allocate a new private competitive typing room in Redis",
      method: "POST",
      path: "/",
      body: CreateRoomRequestSchema.strict(),
      responses: {
        201: CreateRoomResponseSchema,
        409: MonkeyClientError.describe("User already has an active room"),
      },
      metadata: meta({
        rateLimit: "roomCreate",
      }),
    },
    getByCode: {
      summary: "lookup room by invite code",
      description:
        "Resolve a room invite code to room metadata before opening WebSocket",
      method: "GET",
      path: "/code/:code",
      pathParams: GetRoomByCodePathParamsSchema.strict(),
      responses: {
        200: GetRoomByCodeResponseSchema,
        404: MonkeyClientError.describe("Room not found"),
      },
      metadata: meta({
        rateLimit: "roomLookup",
      }),
    },
  },
  {
    pathPrefix: "/rooms",
    strictStatusCodes: true,
    metadata: meta({
      authenticationOptions: {
        acceptApeKeys: false,
      },
      requireConfiguration: {
        path: "rooms.enabled",
        invalidMessage: "Competitive rooms are not available at this time.",
      },
    }),
    commonResponses: CommonResponses,
  },
);
