// At-most-once execution. A crashed/pending claim must never be replayed as work.
// No request bodies, filenames or document bytes are retained here.
export async function runOnceIn(db: D1Database, scope: {
  organizationId: string; userId: string; key: string; fingerprint: string;
}, work: () => Promise<Response>): Promise<Response> {
  const { organizationId, userId, key, fingerprint } = scope;
  if (!/^[a-f0-9-]{36}$/i.test(key)) return Response.json({ error: "Identificador de operación inválido." }, { status: 400 });
  const claim = await db.prepare(`INSERT INTO mutation_receipts
    (organization_id, user_id, request_key, fingerprint) VALUES (?, ?, ?, ?)
    ON CONFLICT DO NOTHING`).bind(organizationId, userId, key, fingerprint).run();
  if (claim.meta.changes !== 1) {
    const previous = await db.prepare(`SELECT fingerprint, response_json AS body, response_status AS status
      FROM mutation_receipts WHERE organization_id = ? AND user_id = ? AND request_key = ?`)
      .bind(organizationId, userId, key).first<{ fingerprint: string; body: string | null; status: number | null }>();
    if (!previous || previous.fingerprint !== fingerprint) return Response.json({ error: "La operación cambió. Revisa los datos antes de enviarla de nuevo." }, { status: 409 });
    if (previous.body === null || previous.status === null) return Response.json({ error: "Esta operación sigue pendiente de confirmación. Revisa el expediente antes de repetirla." }, { status: 409 });
    return new Response(previous.body, { status: previous.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  const response = await work();
  // The routes store only a resource ID or generic result/error, never uploads.
  const body = await response.clone().text();
  await db.prepare(`UPDATE mutation_receipts SET response_json = ?, response_status = ?
    WHERE organization_id = ? AND user_id = ? AND request_key = ?`)
    .bind(body, response.status, organizationId, userId, key).run();
  return response;
}
