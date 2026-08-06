const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_SCOPES =
  "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose";

function requireGoogleCreds() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET belum di-set di server.");
  }
  return { clientId, clientSecret };
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const { clientId, clientSecret } = requireGoogleCreds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google: gagal tukar code jadi token (status ${res.status}): ${body}`);
    throw new Error(`Gagal tukar code jadi token: ${body}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = requireGoogleCreds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    // The routine failure mode here is a revoked/expired refresh token
    // (user disconnected the app from their Google account, or Google
    // force-expired it) -- log it so that's visible somewhere other than
    // whatever caller's error message the user happens to see.
    console.error(`Google: gagal refresh access token (status ${res.status}): ${body}`);
    throw new Error(`Gagal refresh token Google: ${body}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function getProfile(accessToken: string): Promise<{ emailAddress: string }> {
  const res = await fetch(`${GMAIL_API}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google: gagal ambil profil Gmail (status ${res.status}): ${body}`);
    throw new Error(`Gagal ambil profil Gmail: ${body}`);
  }
  return res.json();
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

type GmailHeader = { name: string; value: string };
type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};

function findHeader(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractPlainText(payload: GmailPart | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return base64UrlDecode(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return base64UrlDecode(payload.body.data).replace(/<[^>]+>/g, " ");
  }
  return "";
}

export type ParsedEmail = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  bodyText: string;
  messageIdHeader: string;
};

export async function listMessages(
  accessToken: string,
  query: string,
  maxResults = 15
): Promise<Array<{ id: string; threadId: string }>> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const res = await fetch(`${GMAIL_API}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google: gagal list email (status ${res.status}): ${body}`);
    throw new Error(`Gagal list email: ${body}`);
  }
  const data = await res.json();
  return data.messages ?? [];
}

export async function getMessage(accessToken: string, id: string): Promise<ParsedEmail> {
  const res = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google: gagal ambil email ${id} (status ${res.status}): ${body}`);
    throw new Error(`Gagal ambil email: ${body}`);
  }
  const data = await res.json();
  const headers: GmailHeader[] = data.payload?.headers ?? [];
  return {
    id: data.id,
    threadId: data.threadId,
    subject: findHeader(headers, "Subject"),
    from: findHeader(headers, "From"),
    date: findHeader(headers, "Date"),
    snippet: data.snippet ?? "",
    bodyText: extractPlainText(data.payload).trim().slice(0, 4000),
    messageIdHeader: findHeader(headers, "Message-ID"),
  };
}

export async function createDraftReply(
  accessToken: string,
  params: {
    threadId: string;
    to: string;
    subject: string;
    bodyText: string;
    inReplyTo: string;
  }
): Promise<void> {
  const subject = params.subject.toLowerCase().startsWith("re:")
    ? params.subject
    : `Re: ${params.subject}`;
  const lines = [
    `To: ${params.to}`,
    `Subject: ${subject}`,
    params.inReplyTo ? `In-Reply-To: ${params.inReplyTo}` : "",
    params.inReplyTo ? `References: ${params.inReplyTo}` : "",
    `Content-Type: text/plain; charset="UTF-8"`,
    "",
    params.bodyText,
  ].filter((l) => l !== "");
  const raw = base64UrlEncode(lines.join("\r\n"));

  const res = await fetch(`${GMAIL_API}/drafts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: { raw, threadId: params.threadId } }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google: gagal bikin draft balasan (status ${res.status}): ${body}`);
    throw new Error(`Gagal bikin draft: ${body}`);
  }
}

export type DraftSummary = { id: string; to: string; subject: string; snippet: string };

// Aslan can only ever create a draft (draftEmailReply above) -- sending is a
// separate, explicit action the user takes in Vreka's own UI
// (components/asisten/GmailDrafts.tsx), never something a tool call does on
// its own. This lists what's waiting for that review.
export async function listDrafts(accessToken: string, maxResults = 10): Promise<DraftSummary[]> {
  const res = await fetch(`${GMAIL_API}/drafts?maxResults=${maxResults}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google: gagal list draft (status ${res.status}): ${body}`);
    throw new Error(`Gagal list draft: ${body}`);
  }
  const data = await res.json();
  const drafts: Array<{ id: string; message: { id: string } }> = data.drafts ?? [];

  return Promise.all(
    drafts.map(async (d) => {
      const detailRes = await fetch(
        `${GMAIL_API}/drafts/${d.id}?format=metadata&metadataHeaders=To&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!detailRes.ok) {
        return { id: d.id, to: "(nggak kebaca)", subject: "(nggak kebaca)", snippet: "" };
      }
      const detail = await detailRes.json();
      const headers: GmailHeader[] = detail.message?.payload?.headers ?? [];
      return {
        id: d.id,
        to: findHeader(headers, "To"),
        subject: findHeader(headers, "Subject"),
        snippet: detail.message?.snippet ?? "",
      };
    })
  );
}

export async function sendDraft(accessToken: string, draftId: string): Promise<void> {
  const res = await fetch(`${GMAIL_API}/drafts/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: draftId }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google: gagal kirim draft ${draftId} (status ${res.status}): ${body}`);
    throw new Error(`Gagal kirim draft: ${body}`);
  }
}

export async function deleteDraft(accessToken: string, draftId: string): Promise<void> {
  const res = await fetch(`${GMAIL_API}/drafts/${draftId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    console.error(`Google: gagal hapus draft ${draftId} (status ${res.status}): ${body}`);
    throw new Error(`Gagal hapus draft: ${body}`);
  }
}
