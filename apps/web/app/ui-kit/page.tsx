'use client';

/**
 * Katalog UI Sembada — referensi hidup untuk primitives di components/ui.
 * Rute dev/desain (di luar (app), tanpa auth). Bukan bagian navigasi produk.
 */
import { useState } from 'react';
import {
  Button,
  Input,
  Select,
  Textarea,
  FormField,
  Card,
  Section,
  PageHeader,
  PageContainer,
  FilterBar,
  FilterLabel,
  Badge,
  StatusBadge,
  StatusBanner,
  Chip,
  EmptyState,
  Skeleton,
  SkeletonText,
  Money,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
  MoneyCell,
  EmptyRow,
  StatCard,
  Modal,
  Segmented,
  type ButtonVariant,
} from '@/components/ui';

const BTN_VARIANTS: ButtonVariant[] = [
  'primary',
  'secondary',
  'ghost',
  'danger',
  'soft-sogan',
  'soft-emas',
  'success',
  'soft-bata',
  'dashed',
];

export default function UiKitPage() {
  const [seg, setSeg] = useState<'barang' | 'jasa'>('barang');
  const [open, setOpen] = useState(false);

  return (
    <main className="min-h-screen bg-cream-100">
      <PageContainer size="wide">
        <PageHeader
          eyebrow="Design System"
          title="Katalog UI Sembada"
          subtitle="Primitives di components/ui — sumber tunggal gaya."
          actions={<Button onClick={() => setOpen(true)}>Buka Modal</Button>}
        />

        <div className="space-y-8">
          <Section title="Tipografi">
            <div className="space-y-2">
              <p className="t-display-3">Display 3 — Fraunces</p>
              <p className="t-h2">Heading 2 — Plus Jakarta</p>
              <p className="t-body">Body — teks isi biasa untuk paragraf.</p>
              <p className="t-eyebrow">Eyebrow label</p>
              <p className="t-caption">Caption / hint kecil.</p>
              <p className="t-money text-3xl">Rp 1.352.949.996</p>
            </div>
          </Section>

          <Section title="Tombol">
            <div className="flex flex-wrap gap-3">
              {BTN_VARIANTS.map((v) => (
                <Button key={v} variant={v}>
                  {v}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button disabled>Disabled</Button>
            </div>
          </Section>

          <Section title="Form controls">
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Nama" required>
                <Input placeholder="cth. PT MarkPlus" />
              </FormField>
              <FormField label="Nominal" hint="Rata kanan + mono">
                <Input numeric placeholder="0" />
              </FormField>
              <FormField label="Kategori">
                <Select>
                  <option>Barang</option>
                  <option>Jasa</option>
                </Select>
              </FormField>
              <FormField label="Catatan" error="Wajib diisi" className="col-span-3">
                <Textarea rows={2} />
              </FormField>
            </div>
          </Section>

          <Section title="Segmented & Filter">
            <Segmented
              options={[
                { value: 'barang', label: 'Barang' },
                { value: 'jasa', label: 'Jasa' },
              ]}
              value={seg}
              onChange={setSeg}
            />
            <FilterBar className="mt-4 mb-0">
              <FilterLabel>Periode</FilterLabel>
              <Select className="w-auto">
                <option>Juni 2026</option>
              </Select>
              <Button size="sm" variant="secondary" className="ml-auto">
                Tampilkan
              </Button>
            </FilterBar>
          </Section>

          <Section title="Badge, Chip, Banner">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="POSTED" />
              <StatusBadge status="DRAFT" />
              <StatusBadge status="PARTIAL" />
              <StatusBadge status="PAID" />
              <StatusBadge status="CANCELLED" />
              <Badge variant="info">Info</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Chip tone="brand">Periode: Mei 2026</Chip>
              <Chip tone="success">Piutang</Chip>
              <Chip tone="danger">Utang</Chip>
            </div>
            <div className="space-y-2 mt-4">
              <StatusBanner tone="success" icon={<span>✓</span>}>
                Debit = Kredit — seimbang
              </StatusBanner>
              <StatusBanner tone="danger" icon={<span>⚠</span>}>
                Selisih Rp 355.000.000
              </StatusBanner>
            </div>
          </Section>

          <Section title="KPI cards">
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="Total Pendapatan" value={6720000000} delta="▲ 12% YoY" deltaTone="up" />
              <StatCard label="Laba Bersih" value={1352949996} delta="▲ 8%" deltaTone="up" />
              <StatCard label="Piutang Jatuh Tempo" value={355000000} delta="3 faktur" deltaTone="down" />
              <StatCard label="PPN Kurang Bayar" value={113850000} featured delta="Jatuh tempo 30 Jun" />
            </div>
          </Section>

          <Section title="Tabel">
            <Table>
              <THead>
                <TH>Akun</TH>
                <TH>Nama</TH>
                <TH numeric>Saldo</TH>
              </THead>
              <TBody>
                <TR>
                  <TD className="font-mono text-xs text-tanah-500">4-101</TD>
                  <TD>Pendapatan Jasa Konsultansi</TD>
                  <MoneyCell>1.950.000.000</MoneyCell>
                </TR>
                <TR>
                  <TD className="font-mono text-xs text-tanah-500">4-102</TD>
                  <TD>Pendapatan Jasa Riset Pasar</TD>
                  <MoneyCell>2.700.000.000</MoneyCell>
                </TR>
              </TBody>
            </Table>
            <div className="mt-4">
              <Table>
                <THead>
                  <TH>Kosong</TH>
                </THead>
                <TBody>
                  <EmptyRow colSpan={1}>Belum ada data.</EmptyRow>
                </TBody>
              </Table>
            </div>
          </Section>

          <Section title="Empty & Loading">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <EmptyState
                  icon={<span className="text-xl">📄</span>}
                  title="Belum ada faktur"
                  description="Buat faktur pertama untuk mulai."
                  action={<Button size="sm">+ Faktur Baru</Button>}
                />
              </Card>
              <Card>
                <SkeletonText lines={4} />
                <Skeleton className="h-24 mt-4" />
              </Card>
            </div>
          </Section>

          <Section title="Angka (Money)">
            <div className="flex items-end gap-8">
              <Money value={9371499596} className="text-4xl" />
              <Money value={355000000} className="text-2xl" />
            </div>
          </Section>
        </div>
      </PageContainer>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Contoh Modal"
        description="Dialog terpusat dengan backdrop, tutup via Esc / klik luar."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => setOpen(false)}>Konfirmasi</Button>
          </>
        }
      >
        <FormField label="Alasan">
          <Textarea rows={3} />
        </FormField>
      </Modal>
    </main>
  );
}
