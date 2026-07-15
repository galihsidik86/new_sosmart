'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Modal, Button, Badge, buttonClass } from '@/components/ui';
import { fmtRp } from '@/lib/format';

interface InboxItem {
  id: string;
  docType: string;
  docId: string;
  amount: string;
  currentStep: number;
  totalSteps: number;
  currentRole: string;
}

const DOC_LABEL: Record<string, string> = {
  PENJUALAN: 'Penjualan', PEMBELIAN: 'Pembelian', KAS_BANK: 'Kas/Bank', JURNAL: 'Jurnal',
};

/**
 * Pop-up daftar dokumen yang menunggu persetujuan user yang sedang login.
 * Muncul sekali per sesi per user (pakai sessionStorage) supaya tidak
 * mengganggu tiap pindah halaman. Kalau tidak ada yang menunggu → tidak render.
 */
export function ApprovalNotifier({ items, userId }: { items: InboxItem[]; userId: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (items.length === 0) return;
    const key = `approval-popup:${userId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    setOpen(true);
  }, [items.length, userId]);

  if (items.length === 0) return null;

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={`${items.length} dokumen menunggu persetujuan Anda`}
      description="Ada permintaan approval yang perlu Anda tindak lanjuti."
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>Nanti</Button>
          <Link
            href={'/approval' as Route}
            className={buttonClass('primary', 'md')}
            onClick={() => setOpen(false)}
          >
            Buka Kotak Approval
          </Link>
        </>
      }
    >
      <ul className="divide-y divide-cream-200 max-h-72 overflow-y-auto">
        {items.map((it) => (
          <li key={it.id} className="py-2 flex items-center justify-between gap-3">
            <span className="text-sm text-tanah-700">{DOC_LABEL[it.docType] ?? it.docType}</span>
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-mono tabular-nums text-sm text-tanah-700">{fmtRp(it.amount)}</span>
              <Badge variant="brand">{it.currentStep}/{it.totalSteps} · {it.currentRole}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
