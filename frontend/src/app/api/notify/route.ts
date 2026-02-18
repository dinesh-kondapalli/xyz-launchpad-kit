import { NextRequest, NextResponse } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const THREAD_ID = process.env.TELEGRAM_THREAD_ID;

export async function POST(req: NextRequest) {
  if (!BOT_TOKEN || !CHAT_ID) {
    return NextResponse.json({ ok: true }); // silently skip if not configured
  }

  try {
    const { name, symbol, creator } = await req.json();

    const text = [
      `<b>🪙 New Token Minted</b>`,
      ``,
      `<b>Name:</b> ${escapeHtml(name)}`,
      `<b>Symbol:</b> $${escapeHtml(symbol)}`,
      `<b>Creator:</b> <code>${creator || "unknown"}</code>`,
    ].join("\n");

    const body: Record<string, unknown> = {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    if (THREAD_ID) {
      body.message_thread_id = Number(THREAD_ID);
    }

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // don't fail the user flow
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
