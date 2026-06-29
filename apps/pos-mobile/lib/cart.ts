/**
 * Cart state in-memory pakai Zustand. Tidak persist — sesi kasir aktif aja.
 */
import { create } from 'zustand';

export interface Item {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  hargaJual: string;
  klasifikasiPpn: string;
  isJasa: boolean;
  isAktif: boolean;
  akunPendapatanId: string | null;
}

export interface CartLine {
  itemId: string;
  kode: string;
  nama: string;
  satuan: string;
  hargaSatuan: number;
  qty: number;
  diskonPersen: number;
  klasifikasiPpn: string;
  isJasa: boolean;
  akunPendapatanId: string | null;
}

interface CartState {
  lines: CartLine[];
  add: (item: Item) => void;
  setQty: (itemId: string, qty: number) => void;
  setDiskon: (itemId: string, persen: number) => void;
  remove: (itemId: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  add: (item) =>
    set((state) => {
      const exist = state.lines.find((l) => l.itemId === item.id);
      if (exist) {
        return {
          lines: state.lines.map((l) =>
            l.itemId === item.id ? { ...l, qty: l.qty + 1 } : l,
          ),
        };
      }
      const newLine: CartLine = {
        itemId: item.id,
        kode: item.kode,
        nama: item.nama,
        satuan: item.satuan,
        hargaSatuan: Number(item.hargaJual),
        qty: 1,
        diskonPersen: 0,
        klasifikasiPpn: item.klasifikasiPpn,
        isJasa: item.isJasa,
        akunPendapatanId: item.akunPendapatanId,
      };
      return { lines: [...state.lines, newLine] };
    }),
  setQty: (itemId, qty) =>
    set((state) => ({
      lines:
        qty <= 0
          ? state.lines.filter((l) => l.itemId !== itemId)
          : state.lines.map((l) => (l.itemId === itemId ? { ...l, qty } : l)),
    })),
  setDiskon: (itemId, persen) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.itemId === itemId ? { ...l, diskonPersen: Math.max(0, Math.min(100, persen)) } : l,
      ),
    })),
  remove: (itemId) =>
    set((state) => ({ lines: state.lines.filter((l) => l.itemId !== itemId) })),
  clear: () => set({ lines: [] }),
}));

const PPNABLE = new Set(['BKP', 'JKP']);

export function lineTotals(line: CartLine, tarifPpnPersen = 11): {
  bruto: number;
  diskon: number;
  dpp: number;
  ppn: number;
  netto: number;
} {
  const bruto = line.hargaSatuan * line.qty;
  const diskon = (bruto * line.diskonPersen) / 100;
  const subtotal = bruto - diskon;
  // PMK 131/2024 skema efektif 11/12: DPP nilai lain = subtotal * (tarifEff/12).
  // Tarif 11 → DPP = subtotal × 11/12, PPN = DPP × 12% (= subtotal × 11%).
  // Tarif 12 → DPP = subtotal penuh, PPN = subtotal × 12%.
  let dpp: number;
  let ppn: number;
  if (!PPNABLE.has(line.klasifikasiPpn)) {
    dpp = subtotal;
    ppn = 0;
  } else if (tarifPpnPersen === 11) {
    dpp = subtotal * (11 / 12);
    ppn = subtotal * 0.11;
  } else {
    dpp = subtotal;
    ppn = subtotal * (tarifPpnPersen / 100);
  }
  return { bruto, diskon, dpp, ppn, netto: dpp + ppn };
}

export function cartTotals(lines: CartLine[], tarifPpnPersen = 11) {
  return lines.reduce(
    (acc, l) => {
      const t = lineTotals(l, tarifPpnPersen);
      acc.bruto += t.bruto;
      acc.diskon += t.diskon;
      acc.dpp += t.dpp;
      acc.ppn += t.ppn;
      acc.netto += t.netto;
      return acc;
    },
    { bruto: 0, diskon: 0, dpp: 0, ppn: 0, netto: 0 },
  );
}
