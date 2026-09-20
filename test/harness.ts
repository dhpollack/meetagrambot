import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { Update } from "grammy/types";
import worker from "../src/index";

/** One outgoing Bot API call the bot made while handling an update. */
export interface BotApiCall {
  method: string;
  payload: Record<string, unknown>;
}

/** One request the bot made to the MeetAgain API. */
export interface ApiRequest {
  path: string;
  search: URLSearchParams;
}

export interface ApiStub {
  /** Status and JSON body to answer with, keyed by pathname. */
  [pathname: string]: { status?: number; body: unknown };
}

export interface Exchange {
  calls: BotApiCall[];
  apiRequests: ApiRequest[];
  replies: string[];
}

const API_ORIGIN = "https://api.test";
const TELEGRAM_ORIGIN = "https://api.telegram.org";

/**
 * Runs one Telegram update through the worker with the MeetAgain API stubbed,
 * and collects every Bot API call the bot made in response.
 *
 * grammy may answer either through a webhook reply (the worker's own response
 * body) or through a separate call to api.telegram.org, so both are collected.
 */
export async function handleUpdate(
  update: Update,
  stub: ApiStub,
): Promise<Exchange> {
  const calls: BotApiCall[] = [];
  const apiRequests: ApiRequest[] = [];
  const realFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input as RequestInfo, init);
    const url = new URL(request.url);

    if (url.origin === API_ORIGIN) {
      apiRequests.push({ path: url.pathname, search: url.searchParams });
      const stubbed = stub[url.pathname];
      if (!stubbed) {
        return Response.json({ error: "not_found" }, { status: 404 });
      }
      return Response.json(stubbed.body, { status: stubbed.status ?? 200 });
    }

    if (url.origin === TELEGRAM_ORIGIN) {
      const method = url.pathname.split("/").pop() ?? "";
      calls.push({
        method,
        payload: (await request.json()) as Record<string, unknown>,
      });
      return Response.json({ ok: true, result: true });
    }

    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;

  try {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("https://bot.test/", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": env.TELEGRAM_SECRET_TOKEN,
        },
        body: JSON.stringify(update),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    const body = await response.text();
    if (body) {
      const webhookReply = JSON.parse(body) as {
        method?: string;
        [key: string]: unknown;
      };
      if (webhookReply.method) {
        const { method, ...payload } = webhookReply;
        calls.push({ method, payload });
      }
    }
  } finally {
    globalThis.fetch = realFetch;
  }

  const replies = calls
    .filter((c) => c.method === "sendMessage")
    .map((c) => String(c.payload.text ?? ""));

  return { calls, apiRequests, replies };
}

let nextId = 1000;

/** A private-chat command or plain-text message from a fresh user. */
export function messageUpdate(text: string): Update {
  const id = nextId++;
  const from = { id, is_bot: false, first_name: "Tester" };
  const entities = text.startsWith("/")
    ? [
        {
          type: "bot_command" as const,
          offset: 0,
          length: text.split(" ")[0].length,
        },
      ]
    : undefined;

  return {
    update_id: id,
    message: {
      message_id: id,
      date: 1700000000,
      chat: { id, type: "private", first_name: "Tester" },
      from,
      text,
      entities,
    },
  } as Update;
}

/** An inline-keyboard button press from a fresh user. */
export function callbackUpdate(data: string): Update {
  const id = nextId++;
  const from = { id, is_bot: false, first_name: "Tester" };

  return {
    update_id: id,
    callback_query: {
      id: String(id),
      from,
      chat_instance: String(id),
      data,
      message: {
        message_id: id,
        date: 1700000000,
        chat: { id, type: "private", first_name: "Tester" },
        from: { id: 1, is_bot: true, first_name: "TestBot" },
        text: "previous",
      },
    },
  } as Update;
}

/** Every inline-keyboard callback_data in a sendMessage reply_markup. */
export function keyboardData(call: BotApiCall): string[] {
  const markup = call.payload.reply_markup as
    | { inline_keyboard?: Array<Array<{ callback_data?: string }>> }
    | string
    | undefined;
  const parsed = typeof markup === "string" ? JSON.parse(markup) : markup;
  return (parsed?.inline_keyboard ?? [])
    .flat()
    .map((b: { callback_data?: string }) => b.callback_data ?? "");
}

/** Every inline-keyboard button label in a sendMessage reply_markup. */
export function keyboardLabels(call: BotApiCall): string[] {
  const markup = call.payload.reply_markup as
    | { inline_keyboard?: Array<Array<{ text?: string }>> }
    | string
    | undefined;
  const parsed = typeof markup === "string" ? JSON.parse(markup) : markup;
  return (parsed?.inline_keyboard ?? [])
    .flat()
    .map((b: { text?: string }) => b.text ?? "");
}
