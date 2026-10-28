import { env } from "cloudflare:workers";
import { buildRawGmailMessage } from "@/lib/email/mime";

type GmailRuntimeEnvironment = {
  EMAIL_FROM_ADDRESS?: string;
  EMAIL_FROM_NAME?: string;
  EMAIL_REPLY_TO?: string;
  GMAIL_OAUTH_CLIENT_ID?: string;
  GMAIL_OAUTH_CLIENT_SECRET?: string;
  GMAIL_OAUTH_REFRESH_TOKEN?: string;
};

export type GmailMessage = {
  body: string;
  deliveryId: string;
  subject: string;
  to: string;
};

type GmailConfiguration = {
  clientId: string;
  clientSecret: string;
  fromAddress: string;
  fromName: string;
  refreshToken: string;
  replyTo: string;
};

export type GmailProviderStatus = {
  configured: boolean;
  sender: string;
};

export class GmailProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
  }
}

export function gmailProviderStatus(): GmailProviderStatus {
  const configuration = gmailConfiguration();
  return {
    configured: Boolean(
      configuration.clientId &&
        configuration.clientSecret &&
        configuration.refreshToken &&
        validEmail(configuration.fromAddress),
    ),
    sender: configuration.fromAddress,
  };
}

export async function sendWithGmail(
  message: GmailMessage,
): Promise<{ providerMessageId: string }> {
  const configuration = gmailConfiguration();
  if (!gmailProviderStatus().configured) {
    throw new GmailProviderError("gmail_not_configured", false);
  }
  if (!validEmail(message.to)) {
    throw new GmailProviderError("recipient_invalid", false);
  }

  const accessToken = await gmailAccessToken(configuration);
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      body: JSON.stringify({
        raw: buildRawGmailMessage({
          ...message,
          fromAddress: configuration.fromAddress,
          fromName: configuration.fromName,
          replyTo: configuration.replyTo,
        }),
      }),
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      throw new GmailProviderError("gmail_temporary_failure", true);
    }
    if (response.status === 403) {
      throw new GmailProviderError("gmail_quota_or_permission", true);
    }
    if (response.status === 401) {
      throw new GmailProviderError("gmail_authorization_required", false);
    }
    throw new GmailProviderError("gmail_message_rejected", false);
  }

  const payload = (await response.json().catch(() => null)) as {
    id?: unknown;
  } | null;
  if (!payload || typeof payload.id !== "string" || !payload.id) {
    throw new GmailProviderError("gmail_invalid_response", true);
  }
  return { providerMessageId: payload.id };
}

function gmailConfiguration(): GmailConfiguration {
  const runtime = env as unknown as GmailRuntimeEnvironment;
  const fromAddress =
    runtime.EMAIL_FROM_ADDRESS?.trim() ||
    "expedientevv.canarias@gmail.com";
  const requestedReplyTo = runtime.EMAIL_REPLY_TO?.trim() || fromAddress;
  return {
    clientId: runtime.GMAIL_OAUTH_CLIENT_ID?.trim() ?? "",
    clientSecret: runtime.GMAIL_OAUTH_CLIENT_SECRET?.trim() ?? "",
    fromAddress,
    fromName: safeHeaderText(
      runtime.EMAIL_FROM_NAME?.trim() || "Expediente VV",
      "Expediente VV",
    ),
    refreshToken: runtime.GMAIL_OAUTH_REFRESH_TOKEN?.trim() ?? "",
    replyTo: validEmail(requestedReplyTo) ? requestedReplyTo : fromAddress,
  };
}

async function gmailAccessToken(
  configuration: GmailConfiguration,
): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      grant_type: "refresh_token",
      refresh_token: configuration.refreshToken,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      throw new GmailProviderError("gmail_token_temporary_failure", true);
    }
    throw new GmailProviderError("gmail_authorization_required", false);
  }
  const payload = (await response.json().catch(() => null)) as {
    access_token?: unknown;
  } | null;
  if (!payload || typeof payload.access_token !== "string") {
    throw new GmailProviderError("gmail_authorization_required", false);
  }
  return payload.access_token;
}

function validEmail(value: string): boolean {
  return (
    !/[\r\n]/.test(value) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function safeHeaderText(value: string, fallback: string): string {
  return /[\r\n]/.test(value) ? fallback : value.slice(0, 80);
}
