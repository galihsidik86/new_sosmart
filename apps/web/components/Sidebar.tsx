'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Role = 'OWNER' | 'ADMIN' | 'AKUNTAN' | 'KASIR' | 'AUDITOR';

interface NavItem {
  href: string;
  label: string;
  group: string;
  /** Kosong/undefined = semua role bisa lihat. */
  roles?: Role[];
}

const FULL: Role[] = ['OWNER', 'ADMIN', 'AKUNTAN'];
const ACCOUNTING: Role[] = ['OWNER', 'ADMIN', 'AKUNTAN', 'AUDITOR'];
const TX_KASIR: Role[] = ['OWNER', 'ADMIN', 'AKUNTAN', 'KASIR'];
const ADMIN_ONLY: Role[] = ['OWNER', 'ADMIN'];

const NAV: NavItem[] = [
  { group: 'Ringkasan', href: '/dashboard', label: 'Dashboard' },
  { group: 'Master Data', href: '/master/barang', label: 'Master Barang', roles: FULL },
  { group: 'Master Data', href: '/master/vendor', label: 'Data Vendor', roles: FULL },
  { group: 'Master Data', href: '/master/pelanggan', label: 'Data Pelanggan', roles: TX_KASIR },
  { group: 'Master Data', href: '/master/project', label: 'Project', roles: FULL },
  { group: 'Master Data', href: '/master/pph23-tarif', label: 'Tarif PPh 23', roles: FULL },
  { group: 'Pembukuan', href: '/pembukuan/coa', label: 'Bagan Akun', roles: ACCOUNTING },
  { group: 'Pembukuan', href: '/pembukuan/jurnal', label: 'Jurnal Umum', roles: ACCOUNTING },
  { group: 'Pembukuan', href: '/pembukuan/bukubesar', label: 'Buku Besar', roles: ACCOUNTING },
  { group: 'Transaksi', href: '/transaksi/penjualan', label: 'Penjualan', roles: TX_KASIR },
  { group: 'Transaksi', href: '/transaksi/pembelian', label: 'Pembelian', roles: FULL },
  { group: 'Transaksi', href: '/transaksi/kas-bank', label: 'Kas / Bank', roles: TX_KASIR },
  { group: 'Persediaan', href: '/persediaan/saldo', label: 'Saldo Stok', roles: ACCOUNTING },
  { group: 'Persediaan', href: '/persediaan/kartu-stok', label: 'Kartu Stok', roles: ACCOUNTING },
  { group: 'Persediaan', href: '/persediaan/penyesuaian', label: 'Penyesuaian Stok', roles: FULL },
  { group: 'Aset Tetap', href: '/aset/daftar', label: 'Daftar Aset', roles: ACCOUNTING },
  { group: 'Aset Tetap', href: '/aset/depresiasi', label: 'Penyusutan Bulanan', roles: FULL },
  { group: 'Pajak', href: '/pajak/karyawan', label: 'Karyawan', roles: FULL },
  { group: 'Pajak', href: '/pajak/payroll', label: 'Payroll PPh 21', roles: FULL },
  { group: 'Pajak', href: '/pajak/bukti-potong', label: 'Bukti Potong', roles: ACCOUNTING },
  { group: 'Pajak', href: '/pajak/spt/ppn', label: 'SPT Masa PPN', roles: ACCOUNTING },
  { group: 'Pajak', href: '/pajak/spt/pph', label: 'SPT Masa PPh', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/neraca-saldo', label: 'Neraca Saldo', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/laba-rugi', label: 'Laba Rugi', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/neraca', label: 'Neraca', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/arus-kas', label: 'Arus Kas', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/perubahan-ekuitas', label: 'Perubahan Ekuitas', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/piutang', label: 'Aging Piutang', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/utang', label: 'Aging Utang', roles: ACCOUNTING },
  { group: 'Laporan', href: '/laporan/budget-actual', label: 'Budget vs Actual', roles: FULL },
  { group: 'Pengaturan', href: '/pengaturan/profil-perusahaan', label: 'Profil Perusahaan', roles: ADMIN_ONLY },
  { group: 'Pengaturan', href: '/pengaturan/periode', label: 'Periode Buku', roles: FULL },
  { group: 'Pengaturan', href: '/pengaturan/cabang', label: 'Cabang', roles: ADMIN_ONLY },
  { group: 'Pengaturan', href: '/pengaturan/user', label: 'Pengguna', roles: ADMIN_ONLY },
  { group: 'Pengaturan', href: '/pengaturan/akun-default', label: 'Akun Default', roles: FULL },
  { group: 'Pengaturan', href: '/pengaturan/saldo-awal', label: 'Saldo Awal', roles: FULL },
];

interface SidebarProps {
  user: { nama: string; email: string };
  tenantNama?: string;
  role?: string;
}

export function Sidebar({ user, tenantNama, role }: SidebarProps) {
  const pathname = usePathname();
  const userRole = role as Role | undefined;
  const visibleNav = NAV.filter(
    (n) => !n.roles || (userRole !== undefined && n.roles.includes(userRole)),
  );
  const groups = Array.from(new Set(visibleNav.map((n) => n.group)));
  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-cream-200 h-screen sticky top-0 flex flex-col py-5 px-3">
      <div className="flex items-center gap-3 px-2 pb-4 border-b border-cream-200 mb-2">
        <div className="w-10 h-10 rounded-xl bg-sogan-500 grid place-items-center text-cream-50 font-bold shadow-sm">
          L
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-tanah-700">
            Lentera
          </div>
          <div className="text-[8.5px] tracking-[0.14em] uppercase text-sogan-500 font-bold">
            Akuntansi · Pajak
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto lentera-scroll -mx-1.5 px-1.5">
        {groups.map((g) => (
          <div key={g}>
            <div className="text-[10px] tracking-[0.12em] uppercase text-tanah-300 font-bold px-3 pt-3 pb-1.5">
              {g}
            </div>
            {visibleNav.filter((n) => n.group === g).map((n) => {
              const active = pathname?.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href as never}
                  className={`block px-3 py-2 rounded-lg text-sm mb-0.5 ${
                    active
                      ? 'bg-sogan-50 text-sogan-500 font-bold'
                      : 'text-tanah-500 hover:bg-cream-50 font-medium'
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2.5 px-2 pt-3 border-t border-cream-200 mt-2">
        <div className="w-8 h-8 rounded-full bg-sogan-500 text-cream-50 grid place-items-center font-bold text-xs">
          {user.nama
            .split(' ')
            .map((w) => w[0])
            .slice(0, 2)
            .join('')}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-tanah-700 truncate">
            {user.nama}
          </div>
          <div className="text-[11px] text-tanah-500 truncate">
            {role ?? user.email}
          </div>
        </div>
      </div>
      {tenantNama && (
        <div className="text-[10px] uppercase tracking-wider text-tanah-300 px-2 pt-2 truncate">
          {tenantNama}
        </div>
      )}
    </aside>
  );
}
