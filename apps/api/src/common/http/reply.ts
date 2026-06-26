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

export function sendPdf(reply: ReplyLike, filename: string, buf: Buffer | Uint8Array): void {
  reply
    .header('content-type', 'application/pdf')
    .header('content-disposition', `attachment; filename="${filename}"`)
    .send(buf);
}
