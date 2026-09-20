import { describe, expect, it } from "vitest";
import spec from "../api/openapi.json";

/**
 * Guards the slice of the MeetAgain API this bot actually consumes.
 *
 * `just setup` re-downloads api/openapi.json. If the platform drops or renames
 * something the bot reads, these fail before the regenerated client reaches
 * production -- a plain `npm run generate` would happily emit a client for an
 * endpoint that no longer exists.
 */

type Schema = {
  type?: string | string[];
  format?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  oneOf?: Array<Schema & { $ref?: string }>;
  allOf?: Array<Schema & { $ref?: string }>;
  $ref?: string;
};

const paths = spec.paths as Record<string, Record<string, unknown>>;
const schemas = spec.components.schemas as unknown as Record<string, Schema>;

/**
 * Flattens a schema to the data contract it describes, so these tests assert
 * what the response carries rather than how the generator happened to compose
 * it -- `allOf` inheritance and a flat object are the same thing to the bot.
 */
function resolve(schema: Schema | undefined): Schema {
  if (!schema) return {};
  if (schema.$ref) {
    return resolve(schemas[schema.$ref.replace("#/components/schemas/", "")]);
  }
  if (schema.allOf) {
    const merged: Schema = { properties: {}, required: [] };
    for (const part of schema.allOf.map(resolve)) {
      Object.assign(merged.properties as object, part.properties);
      merged.required?.push(...(part.required ?? []));
      merged.type ??= part.type;
    }
    return merged;
  }
  if (schema.oneOf) {
    const named = schema.oneOf.find((s) => s.$ref);
    if (named) return resolve(named);
  }
  return schema;
}

function prop(schemaName: string, path: string): Schema {
  let current = resolve(schemas[schemaName]);
  for (const segment of path.split(".")) {
    const next = current.properties?.[segment];
    expect(
      next,
      `${schemaName}.${path}: "${segment}" is missing`,
    ).toBeDefined();
    current = resolve(next);
  }
  return current;
}

function typeOf(schema: Schema): string[] {
  return Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];
}

describe("endpoints the bot calls", () => {
  it.each([
    ["/api/v1/events", "get"],
    ["/api/v1/events/{id}", "get"],
    ["/api/v1/groups", "get"],
    ["/api/v1/groups/{groupSlug}", "get"],
  ])("%s %s still exists", (path, method) => {
    expect(paths[path]).toBeDefined();
    expect(paths[path][method]).toBeDefined();
  });

  it.each([
    ["/api/v1/events", "get"],
    ["/api/v1/groups", "get"],
  ])("%s %s needs no authentication", (path, method) => {
    const operation = paths[path][method] as { security?: unknown[] };
    expect(operation.security ?? []).toEqual([]);
  });

  it("still accepts the limit and from query parameters on /events", () => {
    const operation = paths["/api/v1/events"].get as {
      parameters: Array<{ name: string; schema: { type: string } }>;
    };
    const byName = new Map(operation.parameters.map((p) => [p.name, p]));

    expect(byName.get("limit")?.schema.type).toBe("integer");
    expect(byName.get("from")?.schema).toMatchObject({
      type: "string",
      format: "date-time",
    });
  });
});

describe("fields the bot renders", () => {
  it("keeps the list envelope on both collections", () => {
    for (const schema of ["EventList", "GroupList"]) {
      expect(schemas[schema].properties?.items?.type).toBe("array");
    }
  });

  it.each([
    ["EventSummary", "id", "integer"],
    ["EventSummary", "title", "string"],
    ["EventSummary", "start", "string"],
    ["EventDetail", "id", "integer"],
    ["EventDetail", "title", "string"],
    ["EventDetail", "start", "string"],
    ["EventDetail", "stop", "string"],
    ["EventDetail", "description", "string"],
    ["EventDetail", "webUrl", "string"],
    ["EventDetail", "location.name", "string"],
    ["EventDetail", "location.street", "string"],
    ["EventDetail", "location.city", "string"],
    ["EventDetail", "location.postcode", "string"],
    ["GroupSummary", "name", "string"],
    ["GroupSummary", "slug", "string"],
    ["GroupDetail", "name", "string"],
    ["GroupDetail", "slug", "string"],
    ["GroupDetail", "description", "string"],
    ["GroupDetail", "detailUrl", "string"],
  ])("%s.%s is still a %s", (schema, path, expected) => {
    expect(typeOf(prop(schema, path))).toContain(expected);
  });

  it.each([
    ["EventSummary", "start"],
    ["EventDetail", "start"],
    ["EventDetail", "stop"],
  ])("%s.%s is still date-time, so the transformer yields a Date", (s, p) => {
    expect(prop(s, p).format).toBe("date-time");
  });

  it.each([
    ["EventSummary", "id"],
    ["EventSummary", "title"],
    ["EventSummary", "start"],
    ["EventDetail", "webUrl"],
    ["GroupSummary", "slug"],
    ["GroupSummary", "name"],
  ])("%s.%s is still required, so the bot may print it unguarded", (s, p) => {
    expect(resolve(schemas[s]).required).toContain(p);
  });
});
