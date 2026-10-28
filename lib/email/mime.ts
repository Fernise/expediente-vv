export type PlainTextEmail = {
  body: string;
  deliveryId: string;
  fromAddress: string;
  fromName: string;
  replyTo: string;
  subject: string;
  to: string;
};

export function buildRawGmailMessage(message: PlainTextEmail): string {
  const safeDeliveryId = message.deliveryId.replace(/[^a-zA-Z0-9_-]/g, "");
  const body = standardBase64(new TextEncoder().encode(message.body)).replace(
    /.{1,76}/g,
    "$&\r\n",
  );
  const mime = [
    `From: ${message.fromName} <${message.fromAddress}>`,
    `To: ${message.to}`,
    `Reply-To: ${message.replyTo}`,
    `Subject: ${encodedHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${safeDeliveryId}@expediente-vv.local>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n");
  return base64Url(new TextEncoder().encode(mime));
}

function encodedHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${standardBase64(new TextEncoder().encode(value))}?=`;
}

function standardBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Url(bytes: Uint8Array): string {
  return standardBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
