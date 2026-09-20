import {
  createExecutionContext,
  env,
  SELF,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("MeetAGramBot", () => {
  it("responds OK on /health (unit style)", async () => {
    const request = new IncomingRequest("http://example.com/health");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });

  it("responds OK on /health (integration style)", async () => {
    const response = await SELF.fetch("http://example.com/health");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });
});
