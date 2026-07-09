# Reverse Proxy (produksi)

Produksi memakai **Caddy** (TLS otomatis) di depan API (NestJS) + Web (Next.js).
Konfigurasi ini **tidak** ada di repo (di `/etc/caddy/Caddyfile` pada server),
jadi didokumentasikan di sini supaya tidak terlupa saat setup ulang.

## Rute wajib untuk domain aplikasi

```caddyfile
lentera.example.com {
	encode gzip zstd

	# API REST
	handle /api/* {
		reverse_proxy 127.0.0.1:4002 {
			header_up Host {host}
			header_up X-Real-IP {remote_host}
			header_up X-Forwarded-For {remote_host}
			header_up X-Forwarded-Proto {scheme}
		}
	}

	# File upload (logo perusahaan, dll) — DILAYANI OLEH API (fastify-static),
	# BUKAN web. Tanpa rute ini, GET /uploads/... akan 404 (kejaring ke web).
	handle /uploads/* {
		reverse_proxy 127.0.0.1:4002
	}

	# Sisanya → Web (Next.js)
	handle {
		reverse_proxy 127.0.0.1:3001
	}
}
```

## Catatan penting

- **`/uploads/*` harus diarahkan ke API (port 4002)**, bukan web. API meng-serve
  file upload via `@fastify/static` (root `apps/api/uploads/`, prefix `/uploads/`,
  lihat `apps/api/src/main.ts`). Path publiknya, mis. `/uploads/logos/<file>.png`.
- Di sisi web, URL file upload di-render **relatif** (mis. `<img src={logoUrl}>`
  dengan `logoUrl = "/uploads/logos/..."`), **bukan** `NEXT_PUBLIC_API_URL + logoUrl`.
  `NEXT_PUBLIC_API_URL` menunjuk API internal (`127.0.0.1:4002`) yang tidak bisa
  diakses browser dan memicu mixed-content di halaman HTTPS.
- Port default: API `4002`, Web `3001` (sesuaikan dengan `.env` / ecosystem PM2).
