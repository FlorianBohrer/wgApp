# WG-App 🏠

Aufgaben mit fair rotierendem Putzplan, Einkaufslisten mit Echtzeit-Sync & Kosten-Splitting, gemeinsame Bucketlist — als installierbare PWA für die ganze WG. Anforderungen: [wg-app.spec.md](wg-app.spec.md), Produkt-Leitplanken: [PRODUCT.md](PRODUCT.md).

**Stack:** Vue 3 + Vite + Pinia (PWA mit Service Worker) · Node/Fastify · SQLite (Node-builtin `node:sqlite`, keine nativen Abhängigkeiten) · SSE für Echtzeit · Web-Push.

---

## Lokal starten

Voraussetzung: Node ≥ 22.

```bash
npm run install:all   # Abhängigkeiten für Server + Client
npm run dev:server    # Backend auf http://localhost:3001
npm run dev:client    # Frontend auf http://localhost:5173 (2. Terminal)
```

Im WLAN vom Handy testen: `http://<IP-deines-Macs>:5173` (IP via `ipconfig getifaddr en0`).

**Produktionsmodus** (ein Prozess, Server liefert das gebaute Frontend aus):

```bash
npm run build && npm start   # alles auf http://localhost:3001
```

Alle Daten (SQLite-DB, Fotos, Secrets) liegen in `server/data/` — Ordner löschen = frischer Start.

## Auf dem iPhone installieren 📱

Die App ist eine PWA — kein App Store nötig:

1. Die gehostete URL (siehe unten) in **Safari** öffnen.
2. **Teilen-Button → „Zum Home-Bildschirm"**.
3. Fertig — die App startet im Vollbild wie eine native App, mit eigenem Icon.

Zuletzt geladene Listen sind offline lesbar; offline abgehakte/hinzugefügte Artikel werden bei Wiederverbindung synchronisiert. **Push-Benachrichtigungen auf iOS funktionieren nur in der installierten PWA** (ab iOS 16.4) und erst nach Aktivierung unter *Mehr → Push-Benachrichtigungen* — und nur, wenn die App über **HTTPS** gehostet ist.

## Hosting — damit die ganze WG zugreifen kann 🌍

Der Server ist ein Monolith mit SQLite: eine Instanz, ein Volume, fertig. Zwei einfache Wege:

### Option A: Railway (am einfachsten, ~5 €/Monat)

1. Repo zu GitHub pushen, auf [railway.app](https://railway.app) „Deploy from GitHub Repo" — das `Dockerfile` wird automatisch erkannt.
2. Unter *Settings → Volumes* ein Volume auf `/app/server/data` mounten (sonst sind die Daten nach jedem Deploy weg!).
3. Unter *Settings → Networking* eine Domain generieren → diese URL an die WG verteilen.

### Option B: Fly.io

```bash
brew install flyctl && fly auth signup
cd wg-app
fly launch --no-deploy        # erkennt das Dockerfile
fly volumes create wgdata --size 1
# in fly.toml ergänzen:
#   [mounts]
#     source = "wgdata"
#     destination = "/app/server/data"
fly deploy
```

Beide geben dir automatisch HTTPS — Voraussetzung für PWA-Installation und Push.

### Eigener Server

`docker build -t wg-app . && docker run -p 3001:3001 -v wgdata:/app/server/data wg-app` hinter einem Reverse-Proxy mit TLS (z. B. Caddy).

## Was noch offen ist (bewusste v1-Abstriche)

- **E-Mail-Versand** (Bestätigung, Passwort-Reset): kein SMTP konfiguriert — Reset-Links werden ins Server-Log geschrieben. Für echten Versand z. B. [Resend](https://resend.com) anbinden.
- **Foto-Kompression**: Uploads werden validiert (Format/10 MB), aber unverändert gespeichert (Kompression bräuchte `sharp`).
- **Backups**: bei Railway/Fly Volume-Snapshots aktivieren; lokal reicht Kopieren von `server/data/`.
- Rest siehe „Nicht im Umfang (v1)" in der [Spec](wg-app.spec.md).

## Tests

Server starten, dann `node server/test/api-test.mjs` — End-to-End-API-Test mit 30 Checks (AC-001, AC-002, AC-005, AC-006, AC-007, AC-009, Duplikat-Hinweis, Login-Sperre).

## Demo-Zugang (lokale Testdaten)

WG „Sonnenallee 12" mit Beispieldaten: `demo@demo-wg.de` / `demo1234demo` (außerdem `mia@…`, `jonas@…`, gleiches Passwort). Zum Zurücksetzen `server/data/` löschen.
