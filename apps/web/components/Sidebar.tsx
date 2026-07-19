'use client';

import { useEffect, useState } from 'react';
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
  roles?: Role[];
}

const FULL: Role[] = ['OWNER', 'ADMIN', 'AKUNTAN'];
const ACCOUNTING: Role[] = ['OWNER', 'ADMIN', 'AKUNTAN', 'AUDITOR'];
const TX_KASIR: Role[] = ['OWNER', 'ADMIN', 'AKUNTAN', 'KASIR'];
const ADMIN_ONLY: Role[] = ['OWNER', 'ADMIN'];

const NAV: NavItem[] = [
  { group: 'Ringkasan', href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { group: 'Transaksi', href: '/transaksi/penjualan', label: 'Penjualan', icon: 'cart', roles: TX_KASIR },
  { group: 'Transaksi', href: '/transaksi/pembelian', label: 'Pembelian', icon: 'bag', roles: FULL },
  { group: 'Transaksi', href: '/transaksi/kas-bank', label: 'Kas / Bank', icon: 'wallet', roles: TX_KASIR },
  { group: 'Transaksi', href: '/approval', label: 'Kotak Approval', icon: 'check', roles: FULL },
  { group: 'Pembukuan', href: '/pembukuan/coa', label: 'Bagan Akun', icon: 'book-open', roles: ACCOUNTING },
  { group: 'Pembukuan', href: '/pembukuan/jurnal', label: 'Jurnal Umum', icon: 'notebook', roles: ACCOUNTING },
  { group: 'Pembukuan', href: '/pembukuan/bukubesar', label: 'Buku Besar', icon: 'book', roles: ACCOUNTING },
  { group: 'Pembukuan', href: '/pembukuan/rekonsiliasi', label: 'Rekonsiliasi Bank', icon: 'check', roles: ACCOUNTING },
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
  { group: 'Laporan', href: '/laporan/konsolidasi', label: 'Konsolidasi Grup', icon: 'building', roles: FULL },
  { group: 'Laporan', href: '/laporan/piutang', label: 'Aging Piutang', icon: 'coins', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/utang', label: 'Aging Utang', icon: 'coins', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/budget-actual', label: 'Budget vs Actual', icon: 'target', roles: FULL },
  { group: 'Laporan', href: '/laporan/jejak-audit', label: 'Jejak Audit', icon: 'search', roles: ACCOUNTING },
  { group: 'Master Data', href: '/master/barang', label: 'Master Barang dan Jasa', icon: 'package', roles: FULL },
  { group: 'Master Data', href: '/master/vendor', label: 'Data Vendor', icon: 'truck', roles: FULL },
  { group: 'Master Data', href: '/master/pelanggan', label: 'Data Pelanggan', icon: 'users', roles: TX_KASIR },
  { group: 'Master Data', href: '/master/jenis-pelanggan', label: 'Jenis Pelanggan', icon: 'users', roles: FULL },
  { group: 'Master Data', href: '/master/project', label: 'Project', icon: 'folder', roles: FULL },
  { group: 'Master Data', href: '/master/industri', label: 'Jenis Industri', icon: 'building', roles: FULL },
  { group: 'Master Data', href: '/master/pph23-tarif', label: 'Tarif PPh 23', icon: 'percent', roles: FULL },
  { group: 'Master Data', href: '/master/termin-pembayaran', label: 'Termin Pembayaran', icon: 'calendar', roles: FULL },
  { group: 'Pengaturan', href: '/pengaturan/profil-perusahaan', label: 'Profil Perusahaan', icon: 'building', roles: ADMIN_ONLY },
  { group: 'Pengaturan', href: '/pengaturan/periode', label: 'Periode Buku', icon: 'calendar', roles: FULL },
  { group: 'Pengaturan', href: '/pengaturan/cabang', label: 'Cabang', icon: 'network', roles: ADMIN_ONLY },
  { group: 'Pengaturan', href: '/pengaturan/user', label: 'Pengguna', icon: 'user-cog', roles: ADMIN_ONLY },
  { group: 'Pengaturan', href: '/pengaturan/akun-default', label: 'Akun Default', icon: 'sliders', roles: FULL },
  { group: 'Pengaturan', href: '/pengaturan/approval', label: 'Aturan Approval', icon: 'check', roles: ADMIN_ONLY },
  { group: 'Pengaturan', href: '/pengaturan/saldo-awal', label: 'Saldo Awal', icon: 'layers', roles: FULL },
];

const GROUP_ORDER = [
  'Ringkasan', 'Transaksi', 'Pembukuan', 'Persediaan',
  'Aset Tetap', 'Pajak', 'Laporan', 'Master Data', 'Pengaturan',
];

interface SidebarProps {
  user: { nama: string; email: string };
  tenantNama?: string;
  role?: string;
  logoUrl?: string | null;
  jenisUsaha?: 'DAGANG' | 'JASA';
}

const initialsOf = (s: string) =>
  s.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function Sidebar({ user, tenantNama, role, logoUrl, jenisUsaha }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop rail

  useEffect(() => {
    if (localStorage.getItem('lentera-sidebar-collapsed') === '1') setCollapsed(true);
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('lentera-sidebar-collapsed', next ? '1' : '0');
      return next;
    });

  const userRole = role as Role | undefined;
  const visibleNav = NAV.filter(
    (n) =>
      (!n.roles || (userRole !== undefined && n.roles.includes(userRole))) &&
      // Usaha jasa: sembunyikan menu Persediaan (tak ada stok barang).
      !(jenisUsaha === 'JASA' && n.group === 'Persediaan'),
  );
  const groups = GROUP_ORDER.filter((g) => visibleNav.some((n) => n.group === g));

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/');

  const hide = collapsed ? 'md:hidden' : '';

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

      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 animate-lent-fade"
          onClick={() => setOpen(false)}
          role="presentation"
        />
      )}

      <aside
        className={cn(
          'flex flex-col text-cream-100 bg-gradient-to-b from-sogan-800 to-sogan-900',
          'fixed inset-y-0 left-0 z-50 w-64 transition-all duration-300 ease-sembada',
          'md:sticky md:top-0 md:h-screen md:z-auto md:translate-x-0',
          collapsed ? 'md:w-[74px]' : 'md:w-64',
          open ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            'flex items-center gap-3 h-16 px-4 border-b border-white/10 flex-shrink-0',
            collapsed && 'md:px-0 md:justify-center',
          )}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="w-9 h-9 rounded-lg object-contain bg-white/95 flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emas-300 to-emas-500 grid place-items-center text-sogan-900 font-bold flex-shrink-0 shadow-sm">
              L
            </div>
          )}
          <div className={cn('min-w-0', hide)}>
            <div className="font-display text-lg font-semibold text-cream-50 leading-none truncate">Lentera</div>
            <div className="text-[8.5px] tracking-[0.16em] uppercase text-emas-300 font-bold mt-1">
              Akuntansi · Pajak
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup menu"
            className={cn('md:hidden ml-auto text-cream-300 hover:text-cream-50', collapsed && 'hidden')}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Workspace / tenant switcher */}
        <div className={cn('px-3 pt-3 pb-1 flex-shrink-0', collapsed && 'md:px-2')}>
          <Link
            href={'/pilih-tenant' as never}
            onClick={() => setOpen(false)}
            title={collapsed ? tenantNama ?? 'Lentera' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-colors',
              collapsed ? 'md:justify-center md:p-2' : 'px-2.5 py-2',
            )}
          >
            <div className="w-8 h-8 rounded-lg bg-sogan-600 border border-white/10 grid place-items-center text-cream-50 font-bold text-xs flex-shrink-0">
              {initialsOf(tenantNama ?? 'L')}
            </div>
            <div className={cn('min-w-0 flex-1', hide)}>
              <div className="text-sm font-semibold text-cream-50 truncate">{tenantNama ?? 'Lentera'}</div>
              <div className="text-[10px] uppercase tracking-wider text-cream-300/70">{role ?? 'workspace'}</div>
            </div>
            <Icon name="swap" size={15} className={cn('text-cream-300/70', hide)} />
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden lentera-scroll px-2 py-2">
          {groups.map((g) => (
            <div key={g} className="mb-0.5">
              {collapsed ? (
                <div className="h-px bg-white/10 mx-2 my-2.5 hidden md:block" />
              ) : null}
              <div className={cn('text-[10px] tracking-[0.12em] uppercase text-sogan-200/50 font-bold px-3 pt-3 pb-1.5', hide)}>
                {g}
              </div>
              {visibleNav.filter((n) => n.group === g).map((n) => {
                const active = isActive(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href as never}
                    onClick={() => setOpen(false)}
                    title={collapsed ? n.label : undefined}
                    className={cn(
                      'relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors duration-fast',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emas-300/70',
                      collapsed && 'md:justify-center md:px-0',
                      active
                        ? 'bg-white/[0.10] text-cream-50 font-semibold'
                        : 'text-cream-200/70 hover:bg-white/[0.06] hover:text-cream-50 font-medium',
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-emas-300" />
                    )}
                    <Icon
                      name={n.icon}
                      className={cn('flex-shrink-0', active ? 'text-emas-300' : 'text-cream-300/50')}
                    />
                    <span className={cn('truncate', hide)}>{n.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div
          className={cn(
            'flex items-center gap-2.5 px-3 py-3 border-t border-white/10 flex-shrink-0',
            collapsed && 'md:justify-center md:px-0',
          )}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sogan-400 to-sogan-600 grid place-items-center text-cream-50 font-bold text-xs flex-shrink-0">
            {initialsOf(user.nama)}
          </div>
          <div className={cn('min-w-0 flex-1', hide)}>
            <div className="text-sm font-semibold text-cream-50 truncate">{user.nama}</div>
            <div className="text-[11px] text-cream-300/60 truncate">{role ?? user.email}</div>
          </div>
        </div>

        {/* Collapse toggle (desktop) */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Lebarkan menu' : 'Ciutkan menu'}
          className="hidden md:flex items-center justify-center gap-2 h-9 border-t border-white/10 text-cream-300/60 hover:text-cream-50 hover:bg-white/5 transition-colors text-[11px] font-semibold uppercase tracking-wider flex-shrink-0"
        >
          <Icon name="chevron-down" size={16} className={cn('transition-transform', collapsed ? '-rotate-90' : 'rotate-90')} />
          <span className={hide}>Ciutkan</span>
        </button>
      </aside>
    </>
  );
}
