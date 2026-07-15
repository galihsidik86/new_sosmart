# Lentera — Backup & Disaster Recovery Runbook

> Terakhir diuji: 2026-07-15 (restore ke DB scratch berhasil, parity 100% dengan
> produksi: 47 tabel, 143 akun, 531 journal_lines, 47 RLS policy ter-restore).

Runbook ini **cocok dengan setup live sesungguhnya**. Kalau infrastruktur berubah
(container, volume, port, host), perbarui bagian Inventaris + skrip.

---

## 1. Inventaris (apa & di mana)

Server: `root@202.134.242.202`, root aplikasi `/srv/lentera` (checkout git).
Kotak ini **berbagi** dengan aplikasi lain (siakad, sikeu-tazkia, bsn-lacak,
mabrur) — hati-hati saat operasi level-server.

| Aset | Lokasi | Di git? | Kritis? |
|---|---|---|---|
| **Database** | container `lentera_prod_postgres` (postgres:16), host `127.0.0.1:5433`, volume `lentera_lentera_pgdata` (~69 MB) | ❌ | ⭐⭐⭐ crown jewels |
| **Roles/grants** | cluster Postgres (role `lentera_app` + password) | ❌ | ⭐⭐ butuh utk RLS |
| **Uploads** | `/srv/lentera/apps/api/uploads/` (`branding.json` + `logos/`) | ❌ | ⭐⭐ ditulis runtime |
| **Secrets** | `/srv/lentera/.env` (DATABASE_URL, JWT secrets, APP_DB_PASSWORD) | ❌ | ⭐⭐⭐ |
| **Kode** | GitHub `galihsidik86/new_sosmart` (origin/main) | ✅ | origin = backup-nya |
| **Deploy config** | `docker-compose.yml`, `ecosystem.config.cjs`, cron, nginx | ✅ (kecuali nginx) | ⭐ |
| **Redis** | container `lentera_prod_redis`, volume `lentera_redisdata` | ❌ | ⛔ cache murni — **tidak** di-backup, rebuildable |

**Kredensial** semua ada di `/srv/lentera/.env`. Password superuser DB diekstrak
dari `DATABASE_URL`; app user (`lentera_app`) dari `APP_DATABASE_URL`.

---

## 2. Apa yang di-backup & RPO/RTO

Skrip `infra/backup/backup.sh` (versioned di repo, jalan di server) meng-backup:

1. **DB** — `pg_dump -Fc` (schema + data + **RLS policies + grants**).
2. **Globals** — `pg_dumpall --globals-only` (roles + password, utk restore mandiri).
3. **Uploads** — tar.gz `apps/api/uploads`.
4. **Secrets** — copy `.env` (perms 600).

Setiap run memverifikasi dump (`pg_restore --list`) — kalau korup, exit non-zero.

- **RPO** (max kehilangan data): **≤ 24 jam** dengan cron harian. Turunkan
  interval kalau perlu (mis. tiap 6 jam) — beban ringan (dump ~340 KB).
- **RTO** (waktu pulih): DB-only restore **~2–5 menit**; full-server rebuild
  **~30–60 menit** (lihat §5C).

> ⚠️ **Gap kritis yang HARUS ditutup: OFFSITE.** Backup default hanya di disk
> server yang sama → **tidak tahan kehilangan server/disk**. Set
> `LENTERA_OFFSITE_TARGET` (rclone/rsync remote) supaya backup terkirim keluar.
> Lihat §6.

---

## 3. Setup backup (sudah terpasang)

Skrip: `/srv/lentera/infra/backup/backup.sh` (dari git). Output ke
`/srv/lentera/backups/{db,globals,uploads,secrets}/`. Retensi lokal 14 hari.

Cron (root), harian 03:15 (offset dari siakad 02:00):

```cron
15 3 * * * /srv/lentera/infra/backup/backup.sh >> /var/log/lentera-backup.log 2>&1
```

Cek cron & log:
```bash
crontab -l | grep lentera
tail -n 20 /var/log/lentera-backup.log
ls -lt /srv/lentera/backups/db | head
```

Jalankan manual kapan saja (mis. sebelum migrasi berisiko):
```bash
/srv/lentera/infra/backup/backup.sh
```

---

## 4. Verifikasi backup (lakukan rutin — mis. bulanan)

Backup yang belum pernah di-restore = belum tentu backup. Uji dengan
restore ke **DB scratch** (aman, tidak menyentuh produksi):

```bash
DUMP=$(ls -t /srv/lentera/backups/db/lentera-*.dump | head -1)
/srv/lentera/infra/backup/restore.sh "$DUMP" lentera_restore_test

# bandingkan jumlah baris beberapa tabel inti vs produksi
set -a; source /srv/lentera/.env; set +a
PGPW=$(sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' <<<"$DATABASE_URL")
for DB in lentera lentera_restore_test; do
  docker exec -e PGPASSWORD=$PGPW lentera_prod_postgres psql -U lentera -d $DB -t -A \
    -c "SELECT '$DB', (SELECT count(*) FROM accounts), (SELECT count(*) FROM journal_lines)"
done

# bersihkan
docker exec -e PGPASSWORD=$PGPW lentera_prod_postgres psql -U lentera -d postgres \
  -c "DROP DATABASE IF EXISTS lentera_restore_test;"
```

Angka harus sama. (Terakhir diuji 2026-07-15 → identik.)

---

## 5. Prosedur pemulihan

Semua `docker exec` di bawah butuh `PGPW` (password superuser):
```bash
set -a; source /srv/lentera/.env; set +a
PGPW=$(sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' <<<"$DATABASE_URL")
```

### 5A. Kerusakan data / migrasi buruk (DB & server sehat)

1. **Hentikan API** supaya tidak menulis saat restore:
   ```bash
   pm2 stop lentera-api
   ```
2. Restore ke DB scratch dulu, verifikasi datanya benar (lihat §4).
3. Kalau yakin, restore **menimpa produksi** (butuh konfirmasi eksplisit):
   ```bash
   DUMP=/srv/lentera/backups/db/lentera-<TS>.dump
   CONFIRM_PROD=yes /srv/lentera/infra/backup/restore.sh "$DUMP" lentera
   ```
   > `restore.sh` menolak target = DB prod tanpa `CONFIRM_PROD=yes`.
4. `pm2 start lentera-api`, cek login + satu laporan.

### 5B. Container DB hilang, tapi VOLUME masih ada

Data ada di volume `lentera_lentera_pgdata`. Cukup jalankan ulang container:
```bash
cd /srv/lentera && docker compose up -d postgres
```
> ⚠️ **Drift diketahui:** compose punya `container_name: lentera_postgres`
> (port 5432), sedangkan yang berjalan `lentera_prod_postgres` (port 5433, dari
> `.env POSTGRES_PORT`). Sebelum mengandalkan `docker compose`, **selaraskan**
> `docker-compose.yml` dengan realita (set `container_name: lentera_prod_postgres`)
> ATAU jalankan container dgn nama/port yang sama seperti semula. Kalau tidak,
> compose bisa membuat container BARU kosong alih-alih memakai volume lama.

### 5C. Kehilangan server total (rebuild dari nol)

Butuh: akses backup **offsite** (§6) + akses GitHub. Kalau backup hanya lokal
dan server hilang → **data hilang** (inilah kenapa §6 wajib).

1. **Provision** server baru (Ubuntu), pasang: docker + docker compose, Node 20,
   pnpm, nginx, git.
2. **Ambil backup** dari offsite ke `/srv/lentera/backups/`.
3. **Clone kode**:
   ```bash
   git clone https://github.com/galihsidik86/new_sosmart.git /srv/lentera
   cd /srv/lentera && git checkout main
   ```
4. **Pulihkan `.env`** dari `backups/secrets/env-<TS>.bak` → `/srv/lentera/.env`.
5. **Angkat Postgres** (container fresh → init membuat role `lentera_app`):
   ```bash
   docker compose up -d postgres   # lihat catatan drift §5B
   ```
6. **Restore globals** (roles + password) lalu **database**:
   ```bash
   set -a; source .env; set +a
   PGPW=$(sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' <<<"$DATABASE_URL")
   GLOB=$(ls -t backups/globals/globals-*.sql | head -1)
   DUMP=$(ls -t backups/db/lentera-*.dump | head -1)
   # roles (abaikan error "role already exists" dari init)
   docker exec -i -e PGPASSWORD=$PGPW lentera_prod_postgres psql -U lentera -d postgres < "$GLOB" || true
   CONFIRM_PROD=yes ./infra/backup/restore.sh "$DUMP" lentera
   ```
   > DB fresh dari init sudah OPEN + role ada; RLS policies & grants ikut dari
   > dump. Kalau restore ke DB yang benar-benar kosong tanpa init, jalankan juga
   > `psql -f packages/db/prisma/sql/rls.sql` sesudahnya.
7. **Restore uploads**:
   ```bash
   tar -xzf "$(ls -t backups/uploads/uploads-*.tar.gz | head -1)" -C apps/api
   ```
8. **Build & jalankan** (lihat CLAUDE.md "Commands"):
   ```bash
   pnpm install
   export NEXT_PUBLIC_API_URL=http://127.0.0.1:4002
   pnpm -r --filter='!@lentera/pos-mobile' build
   pm2 start ecosystem.config.cjs && pm2 save
   ```
9. **nginx**: pasang ulang server block untuk `lentera.sosmartpro.com`
   (reverse-proxy web:3001, api:4002) + sertifikat TLS (certbot). Simpan config
   nginx ke repo/offsite supaya langkah ini tidak dari memori.
10. Verifikasi: login, buka Neraca + Arus Kas (balanced), cek uploads/logo tampil.

---

## 6. Offsite (WAJIB — gap yang masih terbuka)

Backup lokal melindungi dari korupsi DB & migrasi buruk, **tetapi bukan** dari
kehilangan server/disk. Tutup dengan salah satu:

- **rclone** ke object storage / Google Drive:
  ```bash
  apt-get install -y rclone && rclone config      # buat remote, mis. "gdrive:"
  # set di crontab / environment skrip:
  export LENTERA_OFFSITE_TARGET="gdrive:lentera-backups"
  ```
- **rsync** ke host lain:
  ```bash
  export LENTERA_OFFSITE_TARGET="user@host-lain:/backups/lentera"
  ```

`backup.sh` otomatis push ke `LENTERA_OFFSITE_TARGET` kalau di-set. **Secrets
(`.env`) harus terenkripsi saat offsite** (mis. `rclone crypt`, atau `gpg`
sebelum kirim) — jangan menaruh JWT/DB password polos di storage pihak ketiga.

Uji restore-from-offsite minimal sekali (tarik dari offsite → restore ke scratch).

---

## 7. Monitoring & disiplin

- **Cek keberhasilan**: `tail /var/log/lentera-backup.log` — baris `DONE` harian.
  Idealnya kirim alert kalau tidak ada `DONE` dalam 26 jam (mis. healthchecks.io
  ping di akhir skrip).
- **Sebelum migrasi/aksi berisiko**: jalankan `backup.sh` manual dulu.
- **Retensi**: 14 hari lokal (default). Untuk offsite, simpan lebih lama
  (mingguan/bulanan) sesuai kebijakan.
- **Kapasitas**: disk root ~6.5 GB kosong — pantau; dump kecil (~0.3 MB) jadi
  aman, tapi jangan biarkan `backups/` tumbuh tanpa retensi.
- **Rahasia**: `.env` backup ber-perms 600; jangan commit ke git; enkripsi di offsite.
