import {
  CreateRoomData,
  CreateRoomRequest,
  roomsContract,
} from "@monkeytype/contracts/rooms";
import { initServer } from "@ts-rest/express";
import { callController } from "../ts-rest-adapter";
import * as RoomsController from "../controllers/rooms";

const s = initServer();
export default s.router(roomsContract, {
  create: {
    handler: async (r) => {
      const result = await callController<
        typeof roomsContract.create,
        undefined,
        CreateRoomRequest,
        undefined,
        CreateRoomData,
        201
      >(RoomsController.createRoom)(r);
      return {
        ...result,
        status: 201 as const,
      };
    },
  },
  getByCode: {
    handler: async (r) => callController(RoomsController.getRoomByCode)(r),
  },
});
