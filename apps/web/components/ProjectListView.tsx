'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { fmtRp, fmtTanggal } from '@/lib/format';
import {
  Badge, Button, FilterBar, FilterLabel, Input, Select,
  Table, THead, TH, TBody, TR, TD, RowActions, MoneyCell, EmptyRow, type BadgeVariant,
} from '@/components/ui';

type Status = 'PERENCANAAN' | 'AKTIF' | 'DITAHAN' | 'SELESAI' | 'DIBATALKAN';
type Prioritas = 'RENDAH' | 'SEDANG' | 'TINGGI';

const STATUS_VARIANT: Record<Status, BadgeVariant> = {
  PERENCANAAN: 'neutral', AKTIF: 'success', DITAHAN: 'warning', SELESAI: 'brand', DIBATALKAN: 'danger',
};
const STATUS_LABEL: Record<Status, string> = {
  PERENCANAAN: 'Perencanaan', AKTIF: 'Aktif', DITAHAN: 'Ditahan', SELESAI: 'Selesai', DIBATALKAN: 'Dibatalkan',
};
const PRIO_VARIANT: Record<Prioritas, BadgeVariant> = { RENDAH: 'neutral', SEDANG: 'warning', TINGGI: 'danger' };
const PRIO_LABEL: Record<Prioritas, string> = { RENDAH: 'Rendah', SEDANG: 'Sedang', TINGGI: 'Tinggi' };

interface IndustriOpt { id: string; kode: string; nama: string }
export interface ProjectRow {
  id: string;
  kode: string;
  nama: string;
  deskripsi: string | null;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  status: Status;
  prioritas: Prioritas;
  budgetTotal: string | null;
  industri: IndustriOpt | null;
  pjNama: string | null;
  progress: number;
  taskTotal: number;
  taskDone: number;
  _count: { members: number; budgets: number };
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function ProjectListView({
  projects,
  orgName,
  includeSelesai,
}: {
  projects: ProjectRow[];
  orgName: string;
  includeSelesai: boolean;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [prio, setPrio] = useState('');
  const [pj, setPj] = useState('');
  const [industriId, setIndustriId] = useState('');
  const [dari, setDari] = useState('');
  const [sampai, setSampai] = useState('');

  const pjOptions = useMemo(
    () => Array.from(new Set(projects.map((p) => p.pjNama).filter((x): x is string => !!x))).sort(),
    [projects],
  );
  const industriOptions = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach((p) => { if (p.industri) m.set(p.industri.id, p.industri.nama); });
    return Array.from(m.entries());
  }, [projects]);

  const filtered = useMemo(
    () =>
      projects.filter((p) => {
        if (q) {
          const s = q.toLowerCase();
          if (
            !p.nama.toLowerCase().includes(s) &&
            !p.kode.toLowerCase().includes(s) &&
            !(p.pjNama ?? '').toLowerCase().includes(s)
          ) return false;
        }
        if (status && p.status !== status) return false;
        if (prio && p.prioritas !== prio) return false;
        if (pj && p.pjNama !== pj) return false;
        if (industriId && p.industri?.id !== industriId) return false;
        const mulai = p.tanggalMulai.slice(0, 10);
        if (dari && mulai < dari) return false;
        if (sampai && mulai > sampai) return false;
        return true;
      }),
    [projects, q, status, prio, pj, industriId, dari, sampai],
  );

  const totalBudget = filtered.reduce((a, p) => a + Number(p.budgetTotal ?? 0), 0);
  const hasFilter = !!(q || status || prio || pj || industriId || dari || sampai);
  const reset = () => { setQ(''); setStatus(''); setPrio(''); setPj(''); setIndustriId(''); setDari(''); setSampai(''); };

  function cetak() {
    const kriteria: string[] = [];
    if (q) kriteria.push(`Pencarian: "${esc(q)}"`);
    if (status) kriteria.push(`Status: ${STATUS_LABEL[status as Status]}`);
    if (prio) kriteria.push(`Prioritas: ${PRIO_LABEL[prio as Prioritas]}`);
    if (pj) kriteria.push(`Penanggung jawab: ${esc(pj)}`);
    if (industriId) kriteria.push(`Industri: ${esc(industriOptions.find(([id]) => id === industriId)?.[1] ?? '')}`);
    if (dari || sampai) kriteria.push(`Periode mulai: ${dari || '…'} s/d ${sampai || '…'}`);
    kriteria.push(includeSelesai ? 'Cakupan: semua (termasuk selesai)' : 'Cakupan: aktif saja');

    const now = new Date();
    const cetakTs = now.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });

    const rowsHtml = filtered
      .map((p, i) => {
        const periode = `${fmtTanggal(p.tanggalMulai)}${p.tanggalSelesai ? ` – ${fmtTanggal(p.tanggalSelesai)}` : ''}`;
        const progres = p.taskTotal > 0 ? `${p.progress}% (${p.taskDone}/${p.taskTotal})` : '—';
        const budget = p.budgetTotal ? fmtRp(p.budgetTotal) : '—';
        return `<tr>
          <td class="c">${i + 1}</td>
          <td class="mono">${esc(p.kode)}</td>
          <td><b>${esc(p.nama)}</b></td>
          <td>${esc(p.pjNama ?? '—')}</td>
          <td>${periode}</td>
          <td>${STATUS_LABEL[p.status]}</td>
          <td>${PRIO_LABEL[p.prioritas]}</td>
          <td class="c">${progres}</td>
          <td class="r">${budget}</td>
        </tr>`;
      })
      .join('');

    const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>Laporan Daftar Project</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #2a2118; margin: 28px; font-size: 12px; }
  .head { border-bottom: 2px solid #a4632a; padding-bottom: 10px; margin-bottom: 14px; }
  .org { font-size: 15px; font-weight: 700; color: #834d1f; }
  h1 { font-size: 18px; margin: 2px 0 4px; }
  .meta { color: #6b5842; font-size: 11px; }
  .krit { margin: 10px 0 14px; padding: 8px 12px; background: #f7f1e6; border: 1px solid #e3d6bf; border-radius: 6px; font-size: 11px; color: #4a3a2a; }
  .krit b { color: #834d1f; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #d8cbb2; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #efe6d5; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  td.c { text-align: center; } td.r { text-align: right; } td.mono, .mono { font-family: ui-monospace, Consolas, monospace; }
  tfoot td { font-weight: 700; background: #f7f1e6; }
  .foot { margin-top: 16px; color: #93826a; font-size: 10px; display: flex; justify-content: space-between; }
  @media print { body { margin: 12mm; } .noprint { display: none; } }
</style></head><body onload="window.print()">
  <div class="head">
    <div class="org">${esc(orgName)}</div>
    <h1>Laporan Daftar Project</h1>
    <div class="meta">Dicetak: ${cetakTs} · ${filtered.length} project</div>
  </div>
  <div class="krit"><b>Kriteria:</b> ${kriteria.map(esc).join(' &nbsp;•&nbsp; ')}</div>
  <table>
    <thead><tr>
      <th>No</th><th>Kode</th><th>Nama Project</th><th>Penanggung Jawab</th>
      <th>Periode</th><th>Status</th><th>Prioritas</th><th>Progres</th><th>Budget</th>
    </tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="9" style="text-align:center;padding:18px;color:#93826a">Tidak ada project sesuai kriteria.</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="8" class="r">Total Budget (${filtered.length} project)</td>
      <td class="r">${fmtRp(String(totalBudget))}</td>
    </tr></tfoot>
  </table>
  <div class="foot"><span>Lentera · Sistem Akuntansi &amp; Pajak</span><span>Halaman laporan internal</span></div>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Popup diblokir browser. Izinkan popup untuk mencetak laporan.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  return (
    <>
      <FilterBar>
        <Input
          placeholder="Cari kode / nama / PJ…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          fullWidth={false}
          className="min-w-[210px]"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} fullWidth={false}>
          <option value="">Semua status</option>
          {(Object.keys(STATUS_LABEL) as Status[]).map((st) => (
            <option key={st} value={st}>{STATUS_LABEL[st]}</option>
          ))}
        </Select>
        <Select value={prio} onChange={(e) => setPrio(e.target.value)} fullWidth={false}>
          <option value="">Semua prioritas</option>
          {(Object.keys(PRIO_LABEL) as Prioritas[]).map((pr) => (
            <option key={pr} value={pr}>{PRIO_LABEL[pr]}</option>
          ))}
        </Select>
        {pjOptions.length > 0 && (
          <Select value={pj} onChange={(e) => setPj(e.target.value)} fullWidth={false}>
            <option value="">Semua PJ</option>
            {pjOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        )}
        {industriOptions.length > 0 && (
          <Select value={industriId} onChange={(e) => setIndustriId(e.target.value)} fullWidth={false}>
            <option value="">Semua industri</option>
            {industriOptions.map(([id, nama]) => <option key={id} value={id}>{nama}</option>)}
          </Select>
        )}
        <span className="flex items-center gap-1.5">
          <FilterLabel>Mulai</FilterLabel>
          <Input type="date" value={dari} onChange={(e) => setDari(e.target.value)} fullWidth={false} />
          <span className="text-tanah-500">–</span>
          <Input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} fullWidth={false} />
        </span>
        {hasFilter && (
          <button type="button" onClick={reset} className="text-xs text-sogan-500 hover:underline">
            reset filter
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-tanah-500">
            {filtered.length} dari {projects.length}
          </span>
          <Button variant="soft-sogan" size="sm" onClick={cetak} leftIcon={<span aria-hidden>🖨</span>}>
            Cetak Laporan
          </Button>
        </div>
      </FilterBar>

      <Table>
        <THead>
          <TH>Kode / Nama</TH>
          <TH>Periode</TH>
          <TH numeric>Budget Total</TH>
          <TH className="text-center w-32">Progres</TH>
          <TH className="text-center">Status</TH>
          <TH className="text-center">Member</TH>
          <TH numeric stickyEnd className="w-24" />
        </THead>
        <TBody>
          {filtered.map((p) => (
            <TR key={p.id}>
              <TD>
                <div className="font-semibold text-tanah-700">{p.nama}</div>
                <div className="text-xs text-tanah-500 font-mono">{p.kode}</div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Badge variant={PRIO_VARIANT[p.prioritas]} size="sm">{p.prioritas.toLowerCase()}</Badge>
                  {p.pjNama && <span className="text-xs text-tanah-500">👤 {p.pjNama}</span>}
                  {p.industri && <Badge variant="neutral" size="sm">{p.industri.nama}</Badge>}
                </div>
              </TD>
              <TD className="text-xs text-tanah-500">
                {fmtTanggal(p.tanggalMulai)}
                {p.tanggalSelesai && <> – {fmtTanggal(p.tanggalSelesai)}</>}
              </TD>
              <MoneyCell>
                {p.budgetTotal ? fmtRp(p.budgetTotal) : <span className="text-tanah-300">—</span>}
              </MoneyCell>
              <TD className="text-center">
                {p.taskTotal > 0 ? (
                  <div>
                    <div className="text-xs text-tanah-500 mb-1">{p.progress}% · {p.taskDone}/{p.taskTotal}</div>
                    <div className="h-1.5 rounded-full bg-cream-200 overflow-hidden">
                      <div className="h-full bg-sogan-500 rounded-full" style={{ width: `${p.progress}%` }} />
                    </div>
                  </div>
                ) : (
                  <span className="text-tanah-300 text-xs">—</span>
                )}
              </TD>
              <TD className="text-center">
                <Badge
                  variant={STATUS_VARIANT[p.status]}
                  size="sm"
                  className={p.status === 'DIBATALKAN' ? 'line-through' : undefined}
                >
                  {STATUS_LABEL[p.status]}
                </Badge>
              </TD>
              <TD className="text-center text-xs text-tanah-500">{p._count.members}</TD>
              <TD stickyEnd className="text-right">
                <RowActions>
                  <Link
                    href={`/master/project/${p.id}` as Route}
                    className="text-xs text-sogan-500 font-semibold hover:underline"
                  >
                    Detail
                  </Link>
                </RowActions>
              </TD>
            </TR>
          ))}
          {filtered.length === 0 && (
            <EmptyRow colSpan={7}>
              {projects.length === 0 ? 'Belum ada project.' : 'Tidak ada project sesuai filter.'}
            </EmptyRow>
          )}
        </TBody>
      </Table>
    </>
  );
}
