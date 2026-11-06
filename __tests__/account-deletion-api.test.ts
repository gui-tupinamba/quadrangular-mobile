let mockRefreshToken: string | null = null;

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => mockRefreshToken),
  setItemAsync: jest.fn(async (_key: string, value: string) => { mockRefreshToken = value; }),
  deleteItemAsync: jest.fn(async () => { mockRefreshToken = null; }),
}));

import * as SecureStore from "expo-secure-store";
import { ApiError, clearSession, requestAccountDeletion, signIn, subscribeSession } from "@/api";

const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
const user = { id: 7, name: "Membro", role: "MEMBER" } as never;

function response(status: number, payload: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => payload } as Response;
}

function authResult(accessToken: string, refreshToken: string) {
  return { access_token: accessToken, refresh_token: refreshToken, user };
}

async function authenticate() {
  fetchMock.mockResolvedValueOnce(response(200, authResult("access-1", "refresh-1")));
  await signIn("member@example.com", "password");
}

beforeEach(async () => {
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
  mockRefreshToken = null;
  await clearSession();
  jest.clearAllMocks();
});

describe("requestAccountDeletion", () => {
  it("sends the exact authenticated request and accepts the 202 response", async () => {
    await authenticate();
    const accepted = { message: "Recebemos sua solicitação.", reference: "0123456789abcdef0123456789abcdef" };
    fetchMock.mockResolvedValueOnce(response(202, accepted));

    await expect(requestAccountDeletion()).resolves.toEqual(accepted);

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://api.guitupinamba.dev/api/profile/account-deletion-request");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual(expect.objectContaining({
      Accept: "application/json",
      Authorization: "Bearer access-1",
      "Content-Type": "application/json",
    }));
    expect(init?.body).toBe('{"confirm":true}');
    expect(mockRefreshToken).toBe("refresh-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renews an expired access token and retries the request once", async () => {
    await authenticate();
    fetchMock
      .mockResolvedValueOnce(response(401, { error: { code: "UNAUTHORIZED", message: "Unauthorized" } }))
      .mockResolvedValueOnce(response(200, authResult("access-2", "refresh-2")))
      .mockResolvedValueOnce(response(202, { message: "Recebido", reference: "a".repeat(32) }));

    await requestAccountDeletion();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1]?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer access-2" }));
    expect(mockRefreshToken).toBe("refresh-2");
  });

  it("preserves the conflict code for support guidance", async () => {
    await authenticate();
    fetchMock.mockResolvedValueOnce(response(409, { error: { code: "CONFLICT", message: "Open request" } }));

    await expect(requestAccountDeletion()).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a successful status other than the documented 202", async () => {
    await authenticate();
    fetchMock.mockResolvedValueOnce(response(200, { message: "Unexpected", reference: "a".repeat(32) }));

    await expect(requestAccountDeletion()).rejects.toMatchObject({ status: 200 });
  });

  it("does not retry automatically after a network failure", async () => {
    await authenticate();
    fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));

    await expect(requestAccountDeletion()).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears local credentials and emits a signed-out session when auth remains invalid", async () => {
    await authenticate();
    fetchMock
      .mockResolvedValueOnce(response(401, { error: { code: "UNAUTHORIZED", message: "Expired" } }))
      .mockResolvedValueOnce(response(401, { error: { code: "UNAUTHORIZED", message: "Expired" } }));
    const listener = jest.fn();
    const unsubscribe = subscribeSession(listener);

    await expect(requestAccountDeletion()).rejects.toMatchObject({ status: 401 });

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("igreja.mobile.refresh");
    expect(listener).toHaveBeenLastCalledWith(null);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});
