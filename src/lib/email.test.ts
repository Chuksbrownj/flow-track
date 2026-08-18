import { afterEach, describe, expect, it, vi } from "vitest";
import { sendSuspendRequestNotice } from "@/lib/email";

type FetchInput = string | URL | Request;

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BREVO_API_KEY;
});

function okResponse(): Response {
  return { ok: true, text: async () => "" } as unknown as Response;
}

function failResponse(): Response {
  return { ok: false, status: 500, text: async () => "boom" } as unknown as Response;
}

function stubFetch(impl: (input: FetchInput, init?: RequestInit) => Promise<Response>) {
  return vi.fn(impl);
}

describe("sendSuspendRequestNotice", () => {
  it("emails every master admin, not just the first", async () => {
    process.env.BREVO_API_KEY = "test-key";
    const fetchMock = stubFetch(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const recipients = ["one@example.com", "two@example.com", "three@example.com"];
    const result = await sendSuspendRequestNotice(recipients, {
      traineeName: "Ada Lovelace",
      reason: "Repeated lateness",
      requestedBy: "Trainer One",
    });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(recipients.length);
    recipients.forEach((email, index) => {
      const init = fetchMock.mock.calls[index][1]!;
      const body = JSON.parse(init.body as string);
      expect(body.to).toEqual([{ email }]);
      expect(body.subject).toBe("Suspension request — Ada Lovelace");
      expect(body.htmlContent).toContain("Ada Lovelace");
      expect(body.htmlContent).toContain("Repeated lateness");
    });
  });

  it("attempts every recipient even when some sends fail", async () => {
    process.env.BREVO_API_KEY = "test-key";
    const fetchMock = stubFetch(async () => okResponse())
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(failResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSuspendRequestNotice(
      ["one@example.com", "two@example.com"],
      { traineeName: "Ada Lovelace", reason: "Repeated lateness", requestedBy: "Trainer One" }
    );

    expect(result).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends nothing and returns false when there are no recipients", async () => {
    process.env.BREVO_API_KEY = "test-key";
    const fetchMock = stubFetch(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSuspendRequestNotice(
      [],
      { traineeName: "Ada Lovelace", reason: "Repeated lateness", requestedBy: "Trainer One" }
    );

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips sending when BREVO_API_KEY is not configured", async () => {
    const fetchMock = stubFetch(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSuspendRequestNotice(
      ["one@example.com"],
      { traineeName: "Ada Lovelace", reason: "Repeated lateness", requestedBy: "Trainer One" }
    );

    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
