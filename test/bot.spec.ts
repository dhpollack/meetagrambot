import { describe, expect, it } from "vitest";
import eventDetail from "./fixtures/event-detail.json";
import eventsList from "./fixtures/events-list.json";
import groupDetail from "./fixtures/group-detail.json";
import groupsList from "./fixtures/groups-list.json";
import {
  type ApiStub,
  callbackUpdate,
  handleUpdate,
  keyboardData,
  keyboardLabels,
  messageUpdate,
} from "./harness";

const EVENT_ID = eventDetail.id;
const GROUP_SLUG = groupDetail.slug;

const stub: ApiStub = {
  "/api/v1/events": { body: eventsList },
  [`/api/v1/events/${EVENT_ID}`]: { body: eventDetail },
  "/api/v1/groups": { body: groupsList },
  [`/api/v1/groups/${GROUP_SLUG}`]: { body: groupDetail },
};

describe("/events", () => {
  it("lists every event the API returned as a keyboard button", async () => {
    const { replies, calls } = await handleUpdate(
      messageUpdate("/events"),
      stub,
    );

    expect(replies[0]).toBe("Upcoming events:");
    expect(keyboardData(calls[0])).toEqual(
      eventsList.items.map((e) => `event:${e.id}`),
    );
    for (const event of eventsList.items) {
      expect(keyboardLabels(calls[0]).join("\n")).toContain(event.title);
    }
  });

  it("renders the start date from the API's ISO timestamp", async () => {
    const { calls } = await handleUpdate(messageUpdate("/events"), stub);
    const expected = new Date(eventsList.items[0].start).toLocaleDateString(
      "sv-SE",
    );

    expect(keyboardLabels(calls[0])[0]).toBe(
      `${eventsList.items[0].title} (${expected})`,
    );
  });

  it("passes limit and from through as query parameters", async () => {
    const { apiRequests } = await handleUpdate(
      messageUpdate("/events 5 2026-10-01"),
      stub,
    );

    expect(apiRequests[0].path).toBe("/api/v1/events");
    expect(apiRequests[0].search.get("limit")).toBe("5");
    expect(apiRequests[0].search.get("from")).toBe(
      new Date("2026-10-01").toISOString(),
    );
  });

  it("defaults to a limit of 10 when no argument is given", async () => {
    const { apiRequests } = await handleUpdate(messageUpdate("/events"), stub);

    expect(apiRequests[0].search.get("limit")).toBe("10");
    expect(apiRequests[0].search.has("from")).toBe(false);
  });

  it("reports an empty list instead of an empty keyboard", async () => {
    const { replies } = await handleUpdate(messageUpdate("/events"), {
      ...stub,
      "/api/v1/events": { body: { total: 0, count: 0, items: [] } },
    });

    expect(replies[0]).toBe("No upcoming events found.");
  });
});

describe("/event", () => {
  it("renders title, dates, location, description and web url", async () => {
    const { replies } = await handleUpdate(
      messageUpdate(`/event ${EVENT_ID}`),
      stub,
    );

    const text = replies[0];
    expect(text).toContain(eventDetail.title);
    expect(text).toContain(
      `Start: ${new Date(eventDetail.start).toLocaleDateString("sv-SE")}`,
    );
    expect(text).toContain(
      `End: ${new Date(eventDetail.stop).toLocaleDateString("sv-SE")}`,
    );
    expect(text).toContain(
      "Location: Travolta, Wiener Strasse. 14b, 10999 Berlin",
    );
    expect(text).toContain(eventDetail.description.slice(0, 40));
    expect(text).toContain(eventDetail.webUrl);
  });

  it("links to the human page, never the API url", async () => {
    const { replies } = await handleUpdate(
      messageUpdate(`/event ${EVENT_ID}`),
      stub,
    );

    expect(replies[0]).toContain(eventDetail.webUrl);
    expect(replies[0]).not.toContain(eventDetail.detailUrl);
  });

  it("reports a 404 from the API rather than crashing", async () => {
    const { replies } = await handleUpdate(messageUpdate("/event 99999999"), {
      ...stub,
      "/api/v1/events/99999999": {
        status: 404,
        body: { error: "not_found" },
      },
    });

    expect(replies[0]).toMatch(/^Error fetching event:/);
  });

  it("rejects a non-numeric id before calling the API", async () => {
    const { replies, apiRequests } = await handleUpdate(
      messageUpdate("/event abc"),
      stub,
    );

    expect(replies[0]).toBe("Event ID must be a number.");
    expect(apiRequests).toHaveLength(0);
  });
});

describe("event: callback button", () => {
  it("answers the callback and renders the same detail view", async () => {
    const { calls, replies } = await handleUpdate(
      callbackUpdate(`event:${EVENT_ID}`),
      stub,
    );

    expect(calls[0].method).toBe("answerCallbackQuery");
    expect(replies[0]).toContain(eventDetail.title);
  });
});

describe("/groups", () => {
  it("lists every group the API returned as a keyboard button", async () => {
    const { replies, calls } = await handleUpdate(
      messageUpdate("/groups"),
      stub,
    );

    expect(replies[0]).toBe("Groups:");
    expect(keyboardLabels(calls[0])).toEqual(
      groupsList.items.map((g) => g.name),
    );
    expect(keyboardData(calls[0])).toEqual(
      groupsList.items.map((g) => `group:${g.slug}`),
    );
  });

  it("produces callback data every slug validator accepts", async () => {
    const { calls } = await handleUpdate(messageUpdate("/groups"), stub);

    for (const data of keyboardData(calls[0])) {
      expect(data.replace(/^group:/, "")).toMatch(/^[a-zA-Z0-9_-]{1,100}$/);
    }
  });
});

describe("/group", () => {
  it("renders name and description", async () => {
    const { replies } = await handleUpdate(
      messageUpdate(`/group ${GROUP_SLUG}`),
      stub,
    );

    expect(replies[0]).toContain(groupDetail.name);
    expect(replies[0]).toContain(groupDetail.description.slice(0, 40));
  });

  it("rejects a slug with illegal characters before calling the API", async () => {
    const { replies, apiRequests } = await handleUpdate(
      messageUpdate("/group ../../etc/passwd"),
      stub,
    );

    expect(replies[0]).toBe("Invalid group slug.");
    expect(apiRequests).toHaveLength(0);
  });

  it("reports a 404 from the API rather than crashing", async () => {
    const { replies } = await handleUpdate(messageUpdate("/group nope"), {
      ...stub,
      "/api/v1/groups/nope": { status: 404, body: { error: "not_found" } },
    });

    expect(replies[0]).toMatch(/^Error fetching group:/);
  });
});

describe("group: callback button", () => {
  it("answers the callback and renders the same detail view", async () => {
    const { calls, replies } = await handleUpdate(
      callbackUpdate(`group:${GROUP_SLUG}`),
      stub,
    );

    expect(calls[0].method).toBe("answerCallbackQuery");
    expect(replies[0]).toContain(groupDetail.name);
  });
});

describe("static commands", () => {
  it("answers /start without touching the API", async () => {
    const { replies, apiRequests } = await handleUpdate(
      messageUpdate("/start"),
      stub,
    );

    expect(replies[0]).toContain("MeetAGramBot");
    expect(apiRequests).toHaveLength(0);
  });

  it("lists every documented command in /help", async () => {
    const { replies } = await handleUpdate(messageUpdate("/help"), stub);

    for (const command of ["/events", "/event", "/groups", "/group"]) {
      expect(replies[0]).toContain(command);
    }
  });
});
