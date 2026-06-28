'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  group: string;
}

const NAV: NavItem[] = [
  { group: 'Ringkasan', href: '/dashboard', label: 'Dashboard' },
  { group: 'Master Data', href: '/master/barang', label: 'Master Barang' },
  { group: 'Master Data', href: '/master/vendor', label: 'Data Vendor' },
  { group: 'Master Data', href: '/master/pelanggan', label: 'Data Pelanggan' },
  { group: 'Pembukuan', href: '/pembukuan/coa', label: 'Bagan Akun' },
  { group: 'Pembukuan', href: '/pembukuan/jurnal', label: 'Jurnal Umum' },
  { group: 'Pembukuan', href: '/pembukuan/bukubesar', label: 'Buku Besar' },
  { group: 'Transaksi', href: '/transaksi/penjualan', label: 'Penjualan' },
  { group: 'Transaksi', href: '/transaksi/pembelian', label: 'Pembelian' },
  { group: 'Transaksi', href: '/transaksi/kas-bank', label: 'Kas / Bank' },
  { group: 'Persediaan', href: '/persediaan/saldo', label: 'Saldo Stok' },
  { group: 'Persediaan', href: '/persediaan/kartu-stok', label: 'Kartu Stok' },
  { group: 'Persediaan', href: '/persediaan/penyesuaian', label: 'Penyesuaian Stok' },
  { group: 'Aset Tetap', href: '/aset/daftar', label: 'Daftar Aset' },
  { group: 'Aset Tetap', href: '/aset/depresiasi', label: 'Penyusutan Bulanan' },
  { group: 'Pajak', href: '/pajak/karyawan', label: 'Karyawan' },
  { group: 'Pajak', href: '/pajak/payroll', label: 'Payroll PPh 21' },
  { group: 'Pajak', href: '/pajak/bukti-potong', label: 'Bukti Potong' },
  { group: 'Pajak', href: '/pajak/spt/ppn', label: 'SPT Masa PPN' },
  { group: 'Pajak', href: '/pajak/spt/pph', label: 'SPT Masa PPh' },
  { group: 'Laporan', href: '/laporan/neraca-saldo', label: 'Neraca Saldo' },
  { group: 'Laporan', href: '/laporan/laba-rugi', label: 'Laba Rugi' },
  { group: 'Laporan', href: '/laporan/neraca', label: 'Neraca' },
  { group: 'Laporan', href: '/laporan/arus-kas', label: 'Arus Kas' },
  { group: 'Laporan', href: '/laporan/perubahan-ekuitas', label: 'Perubahan Ekuitas' },
  { group: 'Pengaturan', href: '/pengaturan/periode', label: 'Periode Buku' },
  { group: 'Pengaturan', href: '/pengaturan/cabang', label: 'Cabang' },
  { group: 'Pengaturan', href: '/pengaturan/user', label: 'Pengguna' },
  { group: 'Pengaturan', href: '/pengaturan/akun-default', label: 'Akun Default' },
];

interface SidebarProps {
  user: { nama: string; email: string };
  tenantNama?: string;
  role?: string;
}

export function Sidebar({ user, tenantNama, role }: SidebarProps) {
  const pathname = usePathname();
  const groups = Array.from(new Set(NAV.map((n) => n.group)));
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
            {NAV.filter((n) => n.group === g).map((n) => {
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
