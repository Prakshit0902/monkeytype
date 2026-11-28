import type { RoomConfig } from "@monkeytype/schemas/rooms";

import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  apeCreateMock,
  apeGetByCodeMock,
  navigateMock,
  useParamsMock,
  showErrorNotificationMock,
  showNoticeNotificationMock,
  showSuccessNotificationMock,
} = vi.hoisted(() => ({
  apeCreateMock: vi.fn(),
  apeGetByCodeMock: vi.fn(),
  navigateMock: vi.fn(),
  useParamsMock: vi.fn(),
  showErrorNotificationMock: vi.fn(),
  showNoticeNotificationMock: vi.fn(),
  showSuccessNotificationMock: vi.fn(),
}));

vi.mock("../../../src/ts/ape", () => ({
  default: {
    rooms: {
      create: apeCreateMock,
      getByCode: apeGetByCodeMock,
    },
    configuration: {
      get: vi.fn(async () => ({
        status: 200,
        body: {
          message: "ok",
          data: {
            rooms: {
              enabled: true,
              maxPlayersPerRoom: 10,
            },
          },
        },
      })),
    },
  },
}));

vi.mock("../../../src/ts/router/navigate", () => ({
  navigate: navigateMock,
}));

vi.mock("@tanstack/solid-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/solid-router")>();
  return {
    ...actual,
    useParams: useParamsMock,
  };
});

vi.mock("../../../src/ts/queries/user", () => ({
  getUserData: () => ({ uid: "user_1", name: "Racer" }),
}));

vi.mock("../../../src/ts/states/notifications", () => ({
  showErrorNotification: showErrorNotificationMock,
  showNoticeNotification: showNoticeNotificationMock,
  showSuccessNotification: showSuccessNotificationMock,
}));

const sampleConfig: RoomConfig = {
  mode: "time",
  mode2: "60",
  language: "english",
  punctuation: false,
  numbers: false,
  difficulty: "normal",
  stopOnError: "off",
  maxPlayers: 4,
};

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

import { RoomEntryModal } from "../../../src/ts/components/modals/RoomEntryModal";
import { RoomPage } from "../../../src/ts/components/pages/room/RoomPage";
import {
  hideModalAndClearChain,
  showModal,
} from "../../../src/ts/states/modals";

describe("RoomEntryModal & RoomPage preview issues", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    hideModalAndClearChain("RoomEntry");

    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.show = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.removeAttribute("open");
    });
  });

  function renderModal(): void {
    const queryClient = new QueryClient();
    render(() => (
      <QueryClientProvider client={queryClient}>
        <RoomEntryModal />
      </QueryClientProvider>
    ));
  }

  it("does not accumulate unbounded per-room keys in sessionStorage across multiple rooms", async () => {
    navigateMock.mockResolvedValue(undefined);
    apeCreateMock
      .mockResolvedValueOnce({
        status: 201,
        body: {
          message: "Room created",
          data: {
            roomId: "room-1",
            code: "CODE0001",
            config: sampleConfig,
            expiresAt: Date.now() + 120_000,
          },
        },
      })
      .mockResolvedValueOnce({
        status: 201,
        body: {
          message: "Room created",
          data: {
            roomId: "room-2",
            code: "CODE0002",
            config: sampleConfig,
            expiresAt: Date.now() + 120_000,
          },
        },
      });

    renderModal();
    showModal("RoomEntry");

    const createBtn = await screen.findByRole("button", {
      name: /create private room/i,
    });
    fireEvent.click(createBtn);
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledTimes(1);
    });

    showModal("RoomEntry");
    const createBtnAgain = await screen.findByRole("button", {
      name: /create private room/i,
    });
    fireEvent.click(createBtnAgain);
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledTimes(2);
    });

    // Should overwrite a single preview key (or prune previous room keys) rather than leaking one key per room
    expect(sessionStorage.length).toBe(1);
  });

  it("ignores expired or invalid cached previews in RoomPage", () => {
    const roomId = "room-expired";
    sessionStorage.setItem(
      `mt_room_preview:${roomId}`,
      JSON.stringify({
        roomId,
        code: "EXPIRED1",
        config: sampleConfig,
        expiresAt: Date.now() - 10_000,
      }),
    );

    useParamsMock.mockReturnValue(() => ({ roomId }));
    render(() => <RoomPage />);

    expect(screen.queryByText("Code: EXPIRED1")).not.toBeInTheDocument();
  });

  it("keeps Create button disabled while navigate() is still pending (prevents double-submit)", async () => {
    const pendingNav = deferred();
    navigateMock.mockReturnValue(pendingNav.promise);
    apeCreateMock.mockResolvedValue({
      status: 201,
      body: {
        message: "Room created",
        data: {
          roomId: "room-race",
          code: "RACE1234",
          config: sampleConfig,
          expiresAt: Date.now() + 120_000,
        },
      },
    });

    renderModal();
    showModal("RoomEntry");

    const createBtn = await screen.findByRole("button", {
      name: /create private room/i,
    });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledTimes(1);
    });

    // While navigate() has not resolved yet, clicking again must not trigger a second room creation
    fireEvent.click(createBtn);
    expect(apeCreateMock).toHaveBeenCalledTimes(1);

    pendingNav.resolve();
  });

  it("keeps Join button disabled while navigate() is still pending (prevents double-submit)", async () => {
    const pendingNav = deferred();
    navigateMock.mockReturnValue(pendingNav.promise);
    apeGetByCodeMock.mockResolvedValue({
      status: 200,
      body: {
        message: "Room found",
        data: {
          roomId: "room-join",
          code: "JOIN1234",
          state: "idle",
          participantCount: 1,
          maxPlayers: 4,
          config: sampleConfig,
        },
      },
    });

    renderModal();
    showModal("RoomEntry");

    const input = await screen.findByPlaceholderText("ABCD1234");
    fireEvent.input(input, { target: { value: "JOIN1234" } });

    const joinBtn = screen.getByRole("button", { name: /^join$/i });
    fireEvent.click(joinBtn);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(joinBtn);
    expect(apeGetByCodeMock).toHaveBeenCalledTimes(1);

    pendingNav.resolve();
  });

  it("recovers isCreating loading state if create throws unexpectedly (try/finally)", async () => {
    apeCreateMock.mockRejectedValueOnce(
      new Error("Unexpected network failure"),
    );

    renderModal();
    showModal("RoomEntry");

    const createBtn = await screen.findByRole("button", {
      name: /create private room/i,
    });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(apeCreateMock).toHaveBeenCalledTimes(1);
    });

    // Without try/finally, isCreating remains stuck true forever
    await waitFor(() => {
      expect(createBtn).not.toBeDisabled();
    });
  });
});
