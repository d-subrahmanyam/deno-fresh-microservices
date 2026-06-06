interface TrackEventPayload {
  event: string;
  userId?: string;
  sessionId?: string;
  traceId?: string;
  page?: string;
  properties?: Record<string, unknown>;
}

export async function trackEvent(payload: TrackEventPayload): Promise<void> {
  try {
    // Server-side (Deno Fresh route): use full API_URL; client-side (island/browser): use relative path
    const baseUrl = typeof Deno !== "undefined"
      ? (Deno.env.get("API_URL") || "http://localhost:3000")
      : "";

    await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: payload.event,
        userId: payload.userId,
        sessionId: payload.sessionId,
        traceId: payload.traceId,
        page: payload.page,
        properties: payload.properties || {},
      }),
    });
  } catch {
    // Fire-and-forget: analytics must never break the caller
  }
}
