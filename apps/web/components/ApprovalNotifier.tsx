'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

// Interval polling saat tab TERLIHAT. Cukup gesit untuk approval; saat tab
// tak terlihat polling dihentikan (0 request) dan langsung poll begitu kembali.
const POLL_MS = 5_000;

/**
 * Pop-up daftar dokumen yang menunggu persetujuan user yang sedang login.
 *
 * REAL-TIME tanpa refresh: selain data awal dari server (render pertama),
 * komponen ini MEM-POLLING `/approval/inbox` tiap 20 detik (dan segera saat
 * tab kembali fokus). Begitu ada permintaan BARU (id yang belum pernah dilihat),
 * popup langsung muncul — approver tak perlu refresh halaman.
 *
 * Anti-ganggu: id yang sudah pernah ditampilkan disimpan di sessionStorage,
 * jadi pindah halaman / reload tak memunculkan ulang item yang sama; hanya
 * permintaan baru yang memicu popup lagi.
 */
export function ApprovalNotifier({ items: initialItems, userId }: { items: InboxItem[]; userId: string }) {
  const [items, setItems] = useState<InboxItem[]>(initialItems);
  const [open, setOpen] = useState(false);
  const seenRef = useRef<Set<string> | null>(null);
  const seenKey = `approval-seen:${userId}`;

  // Muat daftar "sudah dilihat" dari sessionStorage (sekali).
  if (seenRef.current === null) {
    let s: Set<string>;
    try {
      s = new Set<string>(JSON.parse((typeof window !== 'undefined' && sessionStorage.getItem(seenKey)) || '[]'));
    } catch {
      s = new Set<string>();
    }
    seenRef.current = s;
  }

  // Setiap kali daftar berubah, cek apakah ada item BELUM dilihat → munculkan popup.
  useEffect(() => {
    const seen = seenRef.current!;
    const unseen = items.filter((it) => !seen.has(it.id));
    if (unseen.length > 0) {
      unseen.forEach((it) => seen.add(it.id));
      try {
        sessionStorage.setItem(seenKey, JSON.stringify([...seen]));
      } catch {
        /* abaikan */
      }
      setOpen(true);
    }
  }, [items, seenKey]);

  // Polling ringan ke inbox (lewat proxy → auth+tenant dari cookie httpOnly).
  // Lewati saat tab tak terlihat → tak ada request sia-sia di background.
  const poll = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    try {
      const res = await fetch('/proxy/approval/inbox', { cache: 'no-store', redirect: 'manual' });
      if (!res.ok) return; // 401/redirect/sesi habis → diamkan, jangan ganggu
      const data = (await res.json()) as InboxItem[];
      if (Array.isArray(data)) setItems(data);
    } catch {
      /* offline / gangguan sesaat → abaikan */
    }
  }, []);

  useEffect(() => {
    const id = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', poll);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', poll);
    };
  }, [poll]);

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
