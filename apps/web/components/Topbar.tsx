'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from './ui/icons';
import { cn } from './ui/cn';
import { logoutAction } from '@/lib/logout-action';

/**
 * Breadcrumb per-rute (level seksi). Identitas spesifik (nomor faktur, dsb)
 * dibawa oleh PageHeader di tiap halaman.
 */
const CRUMB: Array<[string, string]> = [
  ['/dashboard', 'Dashboard'],
  ['/master/barang', 'Master Barang'],
  ['/master/vendor', 'Data Vendor'],
  ['/master/pelanggan', 'Data Pelanggan'],
  ['/master/project', 'Project'],
  ['/master/pph23-tarif', 'Tarif PPh 23'],
  ['/pembukuan/coa', 'Bagan Akun'],
  ['/pembukuan/jurnal', 'Jurnal Umum'],
  ['/pembukuan/bukubesar', 'Buku Besar'],
  ['/transaksi/penjualan', 'Penjualan'],
  ['/transaksi/pembelian', 'Pembelian'],
  ['/transaksi/kas-bank', 'Kas / Bank'],
  ['/persediaan/saldo', 'Saldo Stok'],
  ['/persediaan/kartu-stok', 'Kartu Stok'],
  ['/persediaan/penyesuaian', 'Penyesuaian Stok'],
  ['/aset/daftar', 'Daftar Aset'],
  ['/aset/depresiasi', 'Penyusutan Bulanan'],
  ['/aset', 'Aset Tetap'],
  ['/pajak/karyawan', 'Karyawan'],
  ['/pajak/payroll', 'Payroll PPh 21'],
  ['/pajak/bukti-potong', 'Bukti Potong'],
  ['/pajak/spt/ppn', 'SPT Masa PPN'],
  ['/pajak/spt/pph', 'SPT Masa PPh'],
  ['/laporan/neraca-saldo', 'Neraca Saldo'],
  ['/laporan/laba-rugi-proyek', 'Laba Rugi per Proyek'],
  ['/laporan/laba-rugi', 'Laba Rugi'],
  ['/laporan/neraca', 'Neraca'],
  ['/laporan/arus-kas', 'Arus Kas'],
  ['/laporan/perubahan-ekuitas', 'Perubahan Ekuitas'],
  ['/laporan/piutang', 'Aging Piutang'],
  ['/laporan/utang', 'Aging Utang'],
  ['/laporan/budget-actual', 'Budget vs Actual'],
  ['/laporan/jejak-audit', 'Jejak Audit'],
  ['/pengaturan/profil-perusahaan', 'Profil Perusahaan'],
  ['/pengaturan/periode', 'Periode Buku'],
  ['/pengaturan/cabang', 'Cabang'],
  ['/pengaturan/user', 'Pengguna'],
  ['/pengaturan/akun-default', 'Akun Default'],
  ['/pengaturan/saldo-awal', 'Saldo Awal'],
];

function crumbFor(pathname: string): string {
  let bestLen = -1;
  let label = '';
  for (const [prefix, l] of CRUMB) {
    if ((pathname === prefix || pathname.startsWith(prefix + '/')) && prefix.length > bestLen) {
      bestLen = prefix.length;
      label = l;
    }
  }
  return label;
}

const initialsOf = (s: string) =>
  s.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

interface TopbarProps {
  tenantNama: string;
  periodeLabel?: string;
  user: { nama: string; email: string };
  role?: string;
}

export function Topbar({ tenantNama, periodeLabel, user, role }: TopbarProps) {
  const pathname = usePathname() ?? '';
  const breadcrumb = crumbFor(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header className="h-16 bg-cream-50/80 backdrop-blur-md border-b border-cream-200 pl-14 pr-4 md:px-6 flex items-center gap-4 sticky top-0 z-20">
      <div className="text-sm text-tanah-500 truncate">
        <span className="hidden sm:inline">{tenantNama} </span>
        {breadcrumb && (
          <>
            <span className="text-tanah-300">/</span>{' '}
            <span className="text-tanah-700 font-semibold">{breadcrumb}</span>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        {periodeLabel && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white border border-cream-300 rounded-lg text-xs font-semibold text-tanah-700 shadow-xs">
            <Icon name="calendar" size={14} className="text-sogan-500" />
            <span className="text-tanah-500 font-medium">Periode</span>
            {periodeLabel}
          </div>
        )}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu pengguna"
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-cream-200/60 transition-colors"
          >
            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-sogan-400 to-sogan-600 grid place-items-center text-cream-50 font-bold text-xs">
              {initialsOf(user.nama)}
            </span>
            <Icon
              name="chevron-down"
              size={14}
              className={cn('text-tanah-500 transition-transform hidden sm:block', menuOpen && 'rotate-180')}
            />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-cream-200 rounded-xl shadow-lg overflow-hidden animate-lent-fade z-30">
              <div className="px-4 py-3 border-b border-cream-200">
                <div className="text-sm font-semibold text-tanah-700 truncate">{user.nama}</div>
                <div className="text-xs text-tanah-500 truncate">{user.email}</div>
                {role && (
                  <div className="mt-1.5 inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-sogan-50 text-sogan-500 rounded-full px-2 py-0.5">
                    {role}
                  </div>
                )}
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-tanah-700 hover:bg-cream-50 transition-colors"
                >
                  <Icon name="logout" size={16} className="text-sogan-500" />
                  Keluar
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
