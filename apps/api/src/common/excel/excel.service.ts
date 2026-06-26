import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

/**
 * Definisi 1 kolom export — header + accessor → value.
 * Format opsional untuk type (date/number/currency) supaya excel render rapi.
 */
export interface ExcelColumn<T> {
  header: string;
  key: string;
  width?: number;
  format?: 'date' | 'number' | 'currency';
  value: (row: T) => unknown;
}

@Injectable()
export class ExcelService {
  /**
   * Build .xlsx Buffer dari array of rows.
   *   - sheetName: max 31 char (Excel limit)
   *   - columns: definisi header + accessor
   *   - rows: data array
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async buildBuffer<T>(
    sheetName: string,
    columns: ExcelColumn<T>[],
    rows: T[],
  ): Promise<any> {
    const wb = new ExcelJS.Workbook();
    wb.created = new Date();
    const ws = wb.addWorksheet(sheetName.slice(0, 31));

    ws.columns = columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? 16,
    }));
    // Header bold
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE7D8' },
    };

    for (const r of rows) {
      const obj: Record<string, unknown> = {};
      for (const c of columns) {
        let v = c.value(r);
        if (c.format === 'date' && v instanceof Date) {
          // exceljs supports Date directly
        } else if (c.format === 'number' || c.format === 'currency') {
          if (v != null) v = Number(v);
        }
        obj[c.key] = v;
      }
      ws.addRow(obj);
    }

    // Apply number format per column
    columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.format === 'currency') col.numFmt = '#,##0.00';
      else if (c.format === 'number') col.numFmt = '#,##0';
      else if (c.format === 'date') col.numFmt = 'yyyy-mm-dd';
    });

    const ab = await wb.xlsx.writeBuffer();
    // exceljs returns its own Buffer subtype; normalize via Uint8Array.
    // The `as Buffer` cast bridges @types/node's stricter Buffer<T> generic.
    return Buffer.from(new Uint8Array(ab as ArrayBufferLike)) as Buffer;
  }

  /**
   * Parse .xlsx buffer → array of objects. Row 1 dianggap header.
   *   - expectedHeaders: nama kolom wajib (case-insensitive match)
   * Return objects dengan key = header asli dari file.
   */
  async parseBuffer(
    buf: Buffer,
    expectedHeaders: string[],
  ): Promise<Array<Record<string, unknown>>> {
    const wb = new ExcelJS.Workbook();
    try {
      // exceljs expects Buffer<ArrayBuffer>; cast bridges Node's stricter Buffer<T>.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await wb.xlsx.load(buf as any);
    } catch {
      throw new BadRequestException('File bukan .xlsx valid');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Workbook kosong');

    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col - 1] = String(cell.value ?? '').trim();
    });

    // Validate expected headers exist
    const lowerHeaders = headers.map((h) => h.toLowerCase());
    for (const expected of expectedHeaders) {
      if (!lowerHeaders.includes(expected.toLowerCase())) {
        throw new BadRequestException(
          `Header wajib "${expected}" tidak ditemukan di file (ditemukan: ${headers.join(', ')})`,
        );
      }
    }

    const out: Array<Record<string, unknown>> = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
      if (rowNo === 1) return; // skip header
      const obj: Record<string, unknown> = {};
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const h = headers[col - 1];
        if (!h) return;
        let v: unknown = cell.value;
        // ExcelJS may return { richText: [...] } or { result, formula } — flatten
        if (v && typeof v === 'object') {
          if ('richText' in v) {
            v = (v as { richText: Array<{ text: string }> }).richText
              .map((t) => t.text).join('');
          } else if ('result' in v) {
            v = (v as { result: unknown }).result;
          } else if ('text' in v) {
            v = (v as { text: string }).text;
          }
        }
        obj[h] = v;
      });
      // Skip baris kosong
      const hasValue = Object.values(obj).some((v) => v != null && v !== '');
      if (hasValue) out.push(obj);
    });
    return out;
  }
}
