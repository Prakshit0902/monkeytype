import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { RoomResultSchema } from "@monkeytype/schemas/room-results";
import {
  CommonResponses,
  meta,
  MonkeyClientError,
  responseWithData,
} from "./util/api";

const c = initContract();

export const GetRoomResultsQuerySchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().nonnegative().optional(),
});
export type GetRoomResultsQuery = z.infer<typeof GetRoomResultsQuerySchema>;

export const GetRoomResultsDataSchema = z.object({
  results: z.array(RoomResultSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type GetRoomResultsData = z.infer<typeof GetRoomResultsDataSchema>;

export const GetRoomResultsResponseSchema = responseWithData(
  GetRoomResultsDataSchema,
);
export type GetRoomResultsResponse = z.infer<
  typeof GetRoomResultsResponseSchema
>;

export const GetRoomResultByRoundIdPathParamsSchema = z.object({
  roundId: z.string().min(1),
});
export type GetRoomResultByRoundIdPathParams = z.infer<
  typeof GetRoomResultByRoundIdPathParamsSchema
>;

export const GetRoomResultByRoundIdResponseSchema =
  responseWithData(RoomResultSchema);
export type GetRoomResultByRoundIdResponse = z.infer<
  typeof GetRoomResultByRoundIdResponseSchema
>;

export const roomResultsContract = c.router(
  {
    getRoomResults: {
      summary: "get room results",
      description:
        "Get paginated competitive room results for the current user",
      method: "GET",
      path: "/",
      query: GetRoomResultsQuerySchema.strict(),
      responses: {
        200: GetRoomResultsResponseSchema,
      },
      metadata: meta({
        rateLimit: "roomResultsGet",
      }),
    },
    getRoomResultByRoundId: {
      summary: "get room result by roundId",
      description: "Get a completed competitive room result by round ID",
      method: "GET",
      path: "/:roundId",
      pathParams: GetRoomResultByRoundIdPathParamsSchema.strict(),
      responses: {
        200: GetRoomResultByRoundIdResponseSchema,
        404: MonkeyClientError.describe("Room result not found"),
      },
      metadata: meta({
        rateLimit: "roomResultsGet",
      }),
    },
  },
  {
    pathPrefix: "/room-results",
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
