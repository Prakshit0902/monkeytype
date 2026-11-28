import { ValidModeRule } from "@monkeytype/schemas/configuration";
import { RoomConfig } from "@monkeytype/schemas/rooms";
import {
  CreateRoomRequest,
  CreateRoomResponse,
  GetRoomByCodePathParams,
  GetRoomByCodeResponse,
} from "@monkeytype/contracts/rooms";
import * as RoomDal from "../../dal/room";
import * as UserDal from "../../dal/user";
import MonkeyError from "../../utils/error";
import { matchesAPattern } from "../../utils/misc";
import { MonkeyResponse } from "../../utils/monkey-response";
import { MonkeyRequest } from "../types";

function isValidRoomMode(
  config: RoomConfig,
  validModeRules: ValidModeRule[],
): boolean {
  return validModeRules.some((rule) => {
    try {
      return (
        matchesAPattern(config.language, rule.language) &&
        matchesAPattern(config.mode, rule.mode) &&
        matchesAPattern(config.mode2, rule.mode2)
      );
    } catch {
      return false;
    }
  });
}

export async function createRoom(
  req: MonkeyRequest<undefined, CreateRoomRequest>,
): Promise<CreateRoomResponse> {
  const { uid } = req.ctx.decodedToken;
  const { config } = req.body;
  const roomsConfig = req.ctx.configuration.rooms;

  const user = await UserDal.getPartialUser(uid, "create room", ["banned"]);
  if (user.banned === true) {
    throw new MonkeyError(403, "Banned users cannot create rooms");
  }

  if (config.maxPlayers > roomsConfig.maxPlayersPerRoom) {
    throw new MonkeyError(
      422,
      `maxPlayers cannot exceed ${roomsConfig.maxPlayersPerRoom}`,
    );
  }

  if (
    roomsConfig.validModeRules.length > 0 &&
    !isValidRoomMode(config, roomsConfig.validModeRules)
  ) {
    throw new MonkeyError(
      422,
      "Room configuration is not allowed by server rules",
    );
  }

  const created = await RoomDal.createRoom({
    uid,
    config,
    emptyRoomTtlSeconds: roomsConfig.emptyRoomTtlSeconds,
  });

  return new MonkeyResponse("Room created", created);
}

export async function getRoomByCode(
  req: MonkeyRequest<undefined, undefined, GetRoomByCodePathParams>,
): Promise<GetRoomByCodeResponse> {
  const { uid } = req.ctx.decodedToken;

  const user = await UserDal.getPartialUser(uid, "lookup room", ["banned"]);
  if (user.banned === true) {
    throw new MonkeyError(403, "Banned users cannot access rooms");
  }

  const room = await RoomDal.getRoomMetaByCode(req.params.code);
  if (room === null) {
    throw new MonkeyError(404, "Room not found");
  }

  return new MonkeyResponse("Room found", {
    roomId: room.roomId,
    code: room.code,
    state: room.state,
    participantCount: room.participantCount,
    maxPlayers: room.config.maxPlayers,
    config: room.config,
  });
}
