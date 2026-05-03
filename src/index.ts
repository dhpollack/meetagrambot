import { Bot, type Context, InlineKeyboard, webhookCallback } from "grammy";
import { interpretMessage } from "./ai";
import { client } from "./api-client/client.gen";
import {
  getApiEvents,
  getApiEventsById,
  getApiGroups,
  getApiGroupsBySlug,
  getApiStatus,
} from "./api-client/sdk.gen";

export interface Env {
  BOT_TOKEN: string;
  BOT_INFO: string;
  API_BASE_URL: string;
  AI: Ai;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    execCtx: ExecutionContext,
  ): Promise<Response> {
    client.setConfig({
      baseUrl: env.API_BASE_URL,
    });

    const bot = new Bot(env.BOT_TOKEN, {
      botInfo: JSON.parse(env.BOT_INFO),
    });

    bot.command("start", (ctx) =>
      ctx.reply(
        "Welcome to MeetAGramBot! Use /help to see available commands.",
      ),
    );

    bot.command("help", (ctx) =>
      ctx.reply(
        [
          "/events [limit] [from] - Upcoming events",
          "/event <id> - Event details",
          "/groups - List public groups",
          "/group <slug> - Group details",
          "/status - API health check",
        ].join("\n"),
      ),
    );

    bot.command("status", async (ctx) => {
      const { data, error } = await getApiStatus();
      if (error) {
        return ctx.reply(`API error: ${errMsg(error)}`);
      }
      return ctx.reply(`API status: ${JSON.stringify(data)}`);
    });

    bot.command("events", async (ctx) => {
      const args = ctx.message?.text?.split(" ").slice(1) ?? [];
      const limit = args[0] ? parseInt(args[0], 10) : 10;
      const from = args[1] ?? undefined;

      const { data, error } = await withCache(
        `events:list:${limit}:${from ?? ""}`,
        () => getApiEvents({ query: { limit, from } }),
        600,
        execCtx,
      );
      if (error) {
        return ctx.reply(`Error fetching events: ${errMsg(error)}`);
      }
      if (!data?.items?.length) {
        return ctx.reply("No upcoming events found.");
      }
      const keyboard = new InlineKeyboard();
      for (const e of data.items) {
        keyboard
          .text(`${e.title} (${e.start?.slice(0, 10)})`, `event:${e.id}`)
          .row();
      }
      return ctx.reply("Upcoming events:", { reply_markup: keyboard });
    });

    bot.callbackQuery(/^event:(.+)$/, async (ctx) => {
      const id = parseInt(ctx.match[1], 10);
      await ctx.answerCallbackQuery();
      const { data, error } = await withCache(
        `events:${id}`,
        () => getApiEventsById({ path: { id } }),
        3600,
        execCtx,
      );
      if (error) {
        return ctx.reply(`Error fetching event: ${errMsg(error)}`);
      }
      if (!data) {
        return ctx.reply("Event not found.");
      }
      const parts = [
        data.title,
        `Start: ${data.start?.slice(0, 16)?.replace("T", " ")}`,
        data.end ? `End: ${data.end.slice(0, 16).replace("T", " ")}` : null,
        data.location ? `Location: ${data.location}` : null,
        data.description ? `\n${data.description}` : null,
        data.url ? `\n${data.url}` : null,
      ].filter(Boolean);
      return ctx.reply(parts.join("\n"));
    });

    bot.command("event", async (ctx) => {
      const idArg = ctx.message?.text?.split(" ")[1];
      if (!idArg) {
        return ctx.reply("Usage: /event <id>");
      }
      const id = parseInt(idArg, 10);
      if (Number.isNaN(id)) {
        return ctx.reply("Event ID must be a number.");
      }

      const { data, error } = await withCache(
        `events:${id}`,
        () => getApiEventsById({ path: { id } }),
        3600,
        execCtx,
      );
      if (error) {
        return ctx.reply(`Error fetching event: ${errMsg(error)}`);
      }
      if (!data) {
        return ctx.reply("Event not found.");
      }
      const parts = [
        data.title,
        `Start: ${data.start?.slice(0, 16)?.replace("T", " ")}`,
        data.end ? `End: ${data.end.slice(0, 16).replace("T", " ")}` : null,
        data.location ? `Location: ${data.location}` : null,
        data.description ? `\n${data.description}` : null,
        data.url ? `\n${data.url}` : null,
      ].filter(Boolean);
      return ctx.reply(parts.join("\n"));
    });

    bot.command("groups", async (ctx) => {
      const { data, error } = await withCache(
        "groups:list",
        () => getApiGroups(),
        3600,
        execCtx,
      );
      if (error) {
        return ctx.reply(`Error fetching groups: ${errMsg(error)}`);
      }
      if (!data?.items?.length) {
        return ctx.reply("No groups found.");
      }
      const keyboard = new InlineKeyboard();
      for (const g of data.items) {
        keyboard.text(g.name ?? g.slug ?? "", `group:${g.slug}`).row();
      }
      return ctx.reply("Groups:", { reply_markup: keyboard });
    });

    bot.callbackQuery(/^group:(.+)$/, async (ctx) => {
      const slug = ctx.match[1];
      await ctx.answerCallbackQuery();
      const { data, error } = await withCache(
        `groups:${slug}`,
        () => getApiGroupsBySlug({ path: { slug } }),
        3600,
        execCtx,
      );
      if (error) {
        return ctx.reply(`Error fetching group: ${errMsg(error)}`);
      }
      if (!data) {
        return ctx.reply("Group not found.");
      }
      const parts = [
        data.name,
        data.description ?? null,
        data.url ? `\n${data.url}` : null,
      ].filter(Boolean);
      return ctx.reply(parts.join("\n"));
    });

    bot.command("group", async (ctx) => {
      const slug = ctx.message?.text?.split(" ")[1];
      if (!slug) {
        return ctx.reply("Usage: /group <slug>");
      }
      const { data, error } = await withCache(
        `groups:${slug}`,
        () => getApiGroupsBySlug({ path: { slug } }),
        3600,
        execCtx,
      );
      if (error) {
        return ctx.reply(`Error fetching group: ${errMsg(error)}`);
      }
      if (!data) {
        return ctx.reply("Group not found.");
      }
      const parts = [
        data.name,
        data.description ?? null,
        data.url ? `\n${data.url}` : null,
      ].filter(Boolean);
      return ctx.reply(parts.join("\n"));
    });

    async function handleStatus(ctx: Context) {
      const { data, error } = await getApiStatus();
      if (error) return ctx.reply(`API error: ${errMsg(error)}`);
      return ctx.reply(`API status: ${JSON.stringify(data)}`);
    }

    async function handleEvents(
      ctx: Context,
      limit: number,
      from: string | undefined,
    ) {
      const { data, error } = await withCache(
        `events:list:${limit}:${from ?? ""}`,
        () => getApiEvents({ query: { limit, from } }),
        600,
        execCtx,
      );
      if (error) return ctx.reply(`Error fetching events: ${errMsg(error)}`);
      if (!data?.items?.length) return ctx.reply("No upcoming events found.");
      const keyboard = new InlineKeyboard();
      for (const e of data.items) {
        keyboard
          .text(`${e.title} (${e.start?.slice(0, 10)})`, `event:${e.id}`)
          .row();
      }
      return ctx.reply("Upcoming events:", { reply_markup: keyboard });
    }

    async function handleEvent(ctx: Context, id: number) {
      const { data, error } = await withCache(
        `events:${id}`,
        () => getApiEventsById({ path: { id } }),
        3600,
        execCtx,
      );
      if (error) return ctx.reply(`Error fetching event: ${errMsg(error)}`);
      if (!data) return ctx.reply("Event not found.");
      const parts = [
        data.title,
        `Start: ${data.start?.slice(0, 16)?.replace("T", " ")}`,
        data.end ? `End: ${data.end.slice(0, 16).replace("T", " ")}` : null,
        data.location ? `Location: ${data.location}` : null,
        data.description ? `\n${data.description}` : null,
        data.url ? `\n${data.url}` : null,
      ].filter(Boolean);
      return ctx.reply(parts.join("\n"));
    }

    async function handleGroups(ctx: Context) {
      const { data, error } = await withCache(
        "groups:list",
        () => getApiGroups(),
        3600,
        execCtx,
      );
      if (error) return ctx.reply(`Error fetching groups: ${errMsg(error)}`);
      if (!data?.items?.length) return ctx.reply("No groups found.");
      const keyboard = new InlineKeyboard();
      for (const g of data.items) {
        keyboard.text(g.name ?? g.slug ?? "", `group:${g.slug}`).row();
      }
      return ctx.reply("Groups:", { reply_markup: keyboard });
    }

    async function handleGroup(ctx: Context, slug: string) {
      const { data, error } = await withCache(
        `groups:${slug}`,
        () => getApiGroupsBySlug({ path: { slug } }),
        3600,
        execCtx,
      );
      if (error) return ctx.reply(`Error fetching group: ${errMsg(error)}`);
      if (!data) return ctx.reply("Group not found.");
      const parts = [
        data.name,
        data.description ?? null,
        data.url ? `\n${data.url}` : null,
      ].filter(Boolean);
      return ctx.reply(parts.join("\n"));
    }

    async function execTool(name: string, args: Record<string, unknown>) {
      switch (name) {
        case "get_events": {
          const limit = (args.limit as number) ?? 20;
          const from = args.from as string | undefined;
          const { data, error } = await withCache(
            `events:list:${limit}:${from ?? ""}`,
            () => getApiEvents({ query: { limit, from } }),
            600,
            execCtx,
          );
          if (error) return { error: errMsg(error) };
          if (!data?.items?.length) return { items: [] };
          return {
            items: data.items.map((e) => ({
              id: e.id,
              title: e.title,
              start: e.start,
              end: e.end,
              location: e.location,
            })),
          };
        }
        case "get_event": {
          const id = args.id as number;
          const { data, error } = await withCache(
            `events:${id}`,
            () => getApiEventsById({ path: { id } }),
            3600,
            execCtx,
          );
          if (error) return { error: errMsg(error) };
          if (!data) return { error: "Event not found" };
          return {
            id: data.id,
            title: data.title,
            start: data.start,
            end: data.end,
            location: data.location,
            description: data.description,
            url: data.url,
          };
        }
        case "get_groups": {
          const { data, error } = await withCache(
            "groups:list",
            () => getApiGroups(),
            3600,
            execCtx,
          );
          if (error) return { error: errMsg(error) };
          if (!data?.items?.length) return { items: [] };
          return {
            items: data.items.map((g) => ({
              id: g.id,
              name: g.name,
              slug: g.slug,
              description: g.description?.slice(0, 500),
            })),
          };
        }
        case "get_group": {
          const slug = args.slug as string;
          const { data, error } = await withCache(
            `groups:${slug}`,
            () => getApiGroupsBySlug({ path: { slug } }),
            3600,
            execCtx,
          );
          if (error) return { error: errMsg(error) };
          if (!data) return { error: "Group not found" };
          return {
            id: data.id,
            name: data.name,
            slug: data.slug,
            description: data.description,
            url: data.url,
          };
        }
        case "get_status": {
          const { data, error } = await getApiStatus();
          if (error) return { error: errMsg(error) };
          return data;
        }
        default:
          return { error: `Unknown tool: ${name}` };
      }
    }

    bot.on("message", async (ctx) => {
      const text = ctx.message?.text?.trim();
      if (!text) {
        return ctx.reply("I don't understand that. Try /help.");
      }

      await ctx.replyWithChatAction("typing");

      const parsed = await interpretMessage(env.AI, text, execTool);

      if (!parsed) {
        return ctx.reply("I don't understand that command. Try /help.");
      }

      const args = parsed.args;
      switch (parsed.command) {
        case "start":
          return ctx.reply(
            "Welcome to MeetAGramBot! Use /help to see available commands.",
          );
        case "help":
          return ctx.reply(
            [
              "/events [limit] [from] - Upcoming events",
              "/event <id> - Event details",
              "/groups - List public groups",
              "/group <slug> - Group details",
              "/status - API health check",
            ].join("\n"),
          );
        case "status":
          return handleStatus(ctx);
        case "events": {
          const parts = args.split(/\s+/).filter(Boolean);
          const limit = parts[0] ? parseInt(parts[0], 10) : 10;
          return handleEvents(ctx, isNaN(limit) ? 10 : limit, parts[1]);
        }
        case "event": {
          const idArg = args.split(/\s+/)[0];
          if (!idArg) return ctx.reply("Usage: /event <id>");
          const id = parseInt(idArg, 10);
          if (isNaN(id)) return ctx.reply("Event ID must be a number.");
          return handleEvent(ctx, id);
        }
        case "groups":
          return handleGroups(ctx);
        case "group": {
          const slug = args.split(/\s+/)[0];
          if (!slug) return ctx.reply("Usage: /group <slug>");
          return handleGroup(ctx, slug);
        }
        default:
          return ctx.reply("I don't understand that command. Try /help.");
      }
    });

    bot.catch((err) => {
      console.error("Bot error:", errMsg(err.error));
    });

    try {
      return await webhookCallback(bot, "cloudflare-mod")(request);
    } catch (e) {
      console.error("Webhook error:", errMsg(e));
      return new Response("OK");
    }
  },
};

async function withCache<T>(
  key: string,
  fetcher: () => Promise<{ data?: T; error?: unknown }>,
  ttl: number,
  ctx: ExecutionContext,
): Promise<{ data?: T; error?: unknown }> {
  const cacheUrl = `https://cache.internal/${key}`;
  try {
    const cached = await caches.default.match(cacheUrl);
    if (cached) {
      return { data: (await cached.json()) as T };
    }
  } catch {
    // Cache read failed, fall through to live API
  }

  const result = await fetcher();

  if (result.data && !result.error) {
    ctx.waitUntil(
      caches.default.put(
        cacheUrl,
        new Response(JSON.stringify(result.data), {
          headers: { "Cache-Control": `public, max-age=${ttl}` },
        }),
      ),
    );
  }

  return result;
}

function errMsg(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
