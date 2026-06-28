/**
 * Subset minimal dari FastifyReply yang dipakai untuk binary download
 * (xlsx, pdf). Hindari `@types/fastify` resolve issue di setup tsx + types.
 */
export interface ReplyLike {
  header(name: string, value: string): ReplyLike;
  send(payload: unknown): unknown;
}

export function sendXlsx(reply: ReplyLike, filename: string, buf: Buffer | Uint8Array): void {
  reply
    .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('content-disposition', `attachment; filename="${filename}"`)
    .send(buf);
}

/**
 * Default `inline` — browser akan render PDF di viewer built-in (tab/iframe)
 * dengan tombol download & print bawaan. Untuk force download, kirim
 * query string `?download=1` ke endpoint atau set `disposition='attachment'`.
 */
export function sendPdf(
  reply: ReplyLike,
  filename: string,
  buf: Buffer | Uint8Array,
  disposition: 'inline' | 'attachment' = 'inline',
): void {
  reply
    .header('content-type', 'application/pdf')
    .header('content-disposition', `${disposition}; filename="${filename}"`)
    .send(buf);
}
