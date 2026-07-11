'use client';

import { usePathname } from 'next/navigation';
import { Icon } from './ui/icons';
import { logoutAction } from '@/lib/logout-action';

/**
 * Breadcrumb per-rute (level seksi). Identitas spesifik (nomor faktur, dsb)
 * kini dibawa oleh PageHeader di tiap halaman, jadi breadcrumb cukup seksi.
 * Dicocokkan dengan prefix terpanjang yang cocok.
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

interface TopbarProps {
  tenantNama: string;
  periodeLabel?: string;
}

export function Topbar({ tenantNama, periodeLabel }: TopbarProps) {
  const pathname = usePathname() ?? '';
  const breadcrumb = crumbFor(pathname);

  return (
    <header className="h-16 bg-cream-50/85 backdrop-blur border-b border-cream-200 pl-14 pr-4 md:px-8 flex items-center gap-4 sticky top-0 z-10">
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
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white border border-cream-300 rounded-md text-xs font-semibold text-tanah-700">
            <Icon name="calendar" size={14} className="text-sogan-500" />
            {periodeLabel}
          </div>
        )}
        <form action={logoutAction}>
          <button className="inline-flex items-center gap-1.5 text-sm text-tanah-700 hover:text-sogan-500 font-semibold transition-colors duration-fast">
            <Icon name="logout" size={16} />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </form>
      </div>
    </header>
  );
}
