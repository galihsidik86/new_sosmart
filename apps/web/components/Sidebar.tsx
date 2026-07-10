'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './ui/icons';
import { cn } from './ui/cn';

type Role = 'OWNER' | 'ADMIN' | 'AKUNTAN' | 'KASIR' | 'AUDITOR';

interface NavItem {
  href: string;
  label: string;
  group: string;
  icon: IconName;
  /** Kosong/undefined = semua role bisa lihat. */
  roles?: Role[];
}

const FULL: Role[] = ['OWNER', 'ADMIN', 'AKUNTAN'];
const ACCOUNTING: Role[] = ['OWNER', 'ADMIN', 'AKUNTAN', 'AUDITOR'];
const TX_KASIR: Role[] = ['OWNER', 'ADMIN', 'AKUNTAN', 'KASIR'];
const ADMIN_ONLY: Role[] = ['OWNER', 'ADMIN'];

const NAV: NavItem[] = [
  { group: 'Ringkasan', href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { group: 'Master Data', href: '/master/barang', label: 'Master Barang', icon: 'package', roles: FULL },
  { group: 'Master Data', href: '/master/vendor', label: 'Data Vendor', icon: 'truck', roles: FULL },
  { group: 'Master Data', href: '/master/pelanggan', label: 'Data Pelanggan', icon: 'users', roles: TX_KASIR },
  { group: 'Master Data', href: '/master/project', label: 'Project', icon: 'folder', roles: FULL },
  { group: 'Master Data', href: '/master/pph23-tarif', label: 'Tarif PPh 23', icon: 'percent', roles: FULL },
  { group: 'Pembukuan', href: '/pembukuan/coa', label: 'Bagan Akun', icon: 'book-open', roles: ACCOUNTING },
  { group: 'Pembukuan', href: '/pembukuan/jurnal', label: 'Jurnal Umum', icon: 'notebook', roles: ACCOUNTING },
  { group: 'Pembukuan', href: '/pembukuan/bukubesar', label: 'Buku Besar', icon: 'book', roles: ACCOUNTING },
  { group: 'Transaksi', href: '/transaksi/penjualan', label: 'Penjualan', icon: 'cart', roles: TX_KASIR },
  { group: 'Transaksi', href: '/transaksi/pembelian', label: 'Pembelian', icon: 'bag', roles: FULL },
  { group: 'Transaksi', href: '/transaksi/kas-bank', label: 'Kas / Bank', icon: 'wallet', roles: TX_KASIR },
  { group: 'Persediaan', href: '/persediaan/saldo', label: 'Saldo Stok', icon: 'boxes', roles: ACCOUNTING },
  { group: 'Persediaan', href: '/persediaan/kartu-stok', label: 'Kartu Stok', icon: 'list', roles: ACCOUNTING },
  { group: 'Persediaan', href: '/persediaan/penyesuaian', label: 'Penyesuaian Stok', icon: 'clipboard', roles: FULL },
  { group: 'Aset Tetap', href: '/aset/daftar', label: 'Daftar Aset', icon: 'building', roles: ACCOUNTING },
  { group: 'Aset Tetap', href: '/aset/depresiasi', label: 'Penyusutan Bulanan', icon: 'trending-down', roles: FULL },
  { group: 'Pajak', href: '/pajak/karyawan', label: 'Karyawan', icon: 'users', roles: FULL },
  { group: 'Pajak', href: '/pajak/payroll', label: 'Payroll PPh 21', icon: 'receipt', roles: FULL },
  { group: 'Pajak', href: '/pajak/bukti-potong', label: 'Bukti Potong', icon: 'file', roles: ACCOUNTING },
  { group: 'Pajak', href: '/pajak/spt/ppn', label: 'SPT Masa PPN', icon: 'file', roles: ACCOUNTING },
  { group: 'Pajak', href: '/pajak/spt/pph', label: 'SPT Masa PPh', icon: 'file', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/neraca-saldo', label: 'Neraca Saldo', icon: 'scale', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/laba-rugi', label: 'Laba Rugi', icon: 'trending-up', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/laba-rugi-proyek', label: 'Laba Rugi per Proyek', icon: 'chart', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/neraca', label: 'Neraca', icon: 'scale', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/arus-kas', label: 'Arus Kas', icon: 'swap', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/perubahan-ekuitas', label: 'Perubahan Ekuitas', icon: 'chart', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/piutang', label: 'Aging Piutang', icon: 'coins', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/utang', label: 'Aging Utang', icon: 'coins', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/budget-actual', label: 'Budget vs Actual', icon: 'target', roles: FULL },
  { group: 'Laporan', href: '/laporan/jejak-audit', label: 'Jejak Audit', icon: 'search', roles: ACCOUNTING },
  { group: 'Pengaturan', href: '/pengaturan/profil-perusahaan', label: 'Profil Perusahaan', icon: 'building', roles: ADMIN_ONLY },
  { group: 'Pengaturan', href: '/pengaturan/periode', label: 'Periode Buku', icon: 'calendar', roles: FULL },
  { group: 'Pengaturan', href: '/pengaturan/cabang', label: 'Cabang', icon: 'network', roles: ADMIN_ONLY },
  { group: 'Pengaturan', href: '/pengaturan/user', label: 'Pengguna', icon: 'user-cog', roles: ADMIN_ONLY },
  { group: 'Pengaturan', href: '/pengaturan/akun-default', label: 'Akun Default', icon: 'sliders', roles: FULL },
  { group: 'Pengaturan', href: '/pengaturan/saldo-awal', label: 'Saldo Awal', icon: 'layers', roles: FULL },
];

interface SidebarProps {
  user: { nama: string; email: string };
  tenantNama?: string;
  role?: string;
  logoUrl?: string | null;
}

export function Sidebar({ user, tenantNama, role, logoUrl }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const userRole = role as Role | undefined;
  const visibleNav = NAV.filter(
    (n) => !n.roles || (userRole !== undefined && n.roles.includes(userRole)),
  );
  const groups = Array.from(new Set(visibleNav.map((n) => n.group)));

  // Aktif = persis atau anak rute (hindari over-match antar rute berprefix sama).
  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/');

  const initials = user.nama
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');

  return (
    <>
      {/* Tombol menu (mobile) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka menu"
        className="md:hidden fixed top-3 left-3 z-40 w-9 h-9 grid place-items-center rounded-lg bg-white border border-cream-200 shadow-sm text-tanah-700"
      >
        <Icon name="menu" />
      </button>

      {/* Backdrop (mobile) */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40 animate-lent-fade"
          onClick={() => setOpen(false)}
          role="presentation"
        />
      )}

      <aside
        className={cn(
          'w-60 flex-shrink-0 bg-white border-r border-cream-200 flex flex-col py-5 px-3',
          'fixed inset-y-0 left-0 z-50 transition-transform duration-base ease-sembada',
          'md:sticky md:top-0 md:h-screen md:z-auto md:translate-x-0',
          open ? 'translate-x-0 shadow-xl' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 px-2 pb-4 border-b border-cream-200 mb-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo perusahaan" className="w-10 h-10 rounded-xl object-contain bg-white border border-cream-200 shadow-sm" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-sogan-500 grid place-items-center text-cream-50 font-bold shadow-sm">
              L
            </div>
          )}
          <div className="min-w-0">
            <div className="font-display text-lg font-semibold text-tanah-700 truncate">
              {tenantNama ?? 'Lentera'}
            </div>
            <div className="text-[8.5px] tracking-[0.14em] uppercase text-sogan-500 font-bold">
              Lentera · Akuntansi
            </div>
          </div>
          {/* Tutup (mobile) */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup menu"
            className="md:hidden ml-auto text-tanah-400 hover:text-tanah-700"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto lentera-scroll -mx-1.5 px-1.5">
          {groups.map((g) => (
            <div key={g}>
              <div className="text-[10px] tracking-[0.12em] uppercase text-tanah-300 font-bold px-3 pt-3 pb-1.5">
                {g}
              </div>
              {visibleNav.filter((n) => n.group === g).map((n) => {
                const active = isActive(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href as never}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors duration-fast',
                      active
                        ? 'bg-sogan-50 text-sogan-500 font-bold'
                        : 'text-tanah-500 hover:bg-cream-50 hover:text-tanah-700 font-medium',
                    )}
                  >
                    <Icon
                      name={n.icon}
                      className={cn('flex-shrink-0', active ? 'text-sogan-500' : 'text-tanah-300')}
                    />
                    <span className="truncate">{n.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2.5 px-2 pt-3 border-t border-cream-200 mt-2">
          <div className="w-8 h-8 rounded-full bg-sogan-500 text-cream-50 grid place-items-center font-bold text-xs">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-tanah-700 truncate">{user.nama}</div>
            <div className="text-[11px] text-tanah-500 truncate">{role ?? user.email}</div>
          </div>
        </div>
      </aside>
    </>
  );
}
