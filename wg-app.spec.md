# Feature: WG-App — Aufgaben, Einkaufslisten & Bucketlist

## Überblick

Eine Progressive Web App (PWA) für Wohngemeinschaften, mit der Mitbewohner gemeinsame Aufgaben (inkl. rotierendem Putzplan), Einkaufslisten (inkl. Kosten-Splitting) und eine gemeinsame Bucketlist verwalten. Jede WG ist ein geschlossener Raum: Nutzer registrieren sich per E-Mail, erstellen eine WG und laden Mitbewohner über einen Einladungscode ein. Die App reduziert typische WG-Konflikte („Wer war mit dem Bad dran?", „Wer hat das Klopapier bezahlt?") durch Transparenz und faire, automatische Rotation.

**Zielgruppe:** WGs mit 2–8 Mitbewohnern, primär mobile Nutzung (Smartphone), sekundär Desktop.

**Nutzerwert:**
- Kein Streit mehr über Zuständigkeiten — der Putzplan rotiert automatisch und fair.
- Eine gemeinsame Einkaufsliste in Echtzeit statt Zettel und Gruppenchat-Chaos.
- Ausgaben werden erfasst und fair aufgeteilt, Salden sind jederzeit sichtbar.
- Die Bucketlist sammelt gemeinsame Pläne und hält fest, was die WG schon erlebt hat.

---

## Rollen

| Rolle | Beschreibung |
|-------|--------------|
| **Gast** | Nicht angemeldeter Besucher; sieht nur Login/Registrierung und Einladungsseite |
| **Mitglied** | Registrierter Nutzer, der einer WG beigetreten ist; voller Zugriff auf Inhalte seiner WG |
| **WG-Admin** | Ersteller der WG (übertragbar); kann zusätzlich Mitglieder entfernen, Einladungscode erneuern und die WG löschen |

---

## Funktionale Anforderungen (EARS)

### Modul A — Konto & WG-Verwaltung

**FR-AUTH-001: Registrierung**
Wenn ein Gast das Registrierungsformular mit gültiger E-Mail, Anzeigename und Passwort (min. 8 Zeichen) absendet, soll das System ein Konto anlegen, eine Bestätigungs-E-Mail senden und den Nutzer anmelden.

**FR-AUTH-002: Login**
Wenn gültige Zugangsdaten übermittelt werden, soll das System eine Sitzung erstellen (Access-Token 15 min, Refresh-Token 30 Tage) und zur WG-Übersicht weiterleiten.

**FR-AUTH-003: Fehlgeschlagener Login**
Wenn ungültige Zugangsdaten übermittelt werden, soll das System die Anmeldung mit einer generischen Fehlermeldung ablehnen und den Fehlversuchszähler erhöhen.

**FR-AUTH-004: Login-Sperre**
Solange mehr als 5 Fehlversuche innerhalb von 15 Minuten vorliegen, soll das System weitere Login-Versuche für dieses Konto 15 Minuten lang ablehnen.

**FR-AUTH-005: Passwort-Reset**
Wenn ein Nutzer einen Passwort-Reset anfordert, soll das System einen einmaligen, 60 Minuten gültigen Reset-Link per E-Mail senden.

**FR-WG-001: WG erstellen**
Solange ein angemeldeter Nutzer keiner WG angehört, wenn er eine WG mit Namen erstellt, soll das System die WG anlegen, ihn als WG-Admin setzen und einen Einladungscode (8 Zeichen, eindeutig) generieren.

**FR-WG-002: WG beitreten**
Wenn ein angemeldeter Nutzer einen gültigen Einladungscode eingibt, soll das System ihn als Mitglied der WG hinzufügen und alle Mitglieder benachrichtigen.

**FR-WG-003: Ungültiger Code**
Wenn ein ungültiger oder erneuerter Einladungscode eingegeben wird, soll das System den Beitritt ablehnen und eine Fehlermeldung anzeigen.

**FR-WG-004: Code erneuern**
Wenn der WG-Admin den Einladungscode erneuert, soll das System einen neuen Code generieren und den alten sofort ungültig machen.

**FR-WG-005: Mitglied verlassen/entfernen**
Wenn ein Mitglied die WG verlässt oder vom Admin entfernt wird, soll das System seine offenen Aufgaben zur Neuverteilung markieren, seine Salden einfrieren und ihm den Zugriff auf WG-Inhalte entziehen.

**FR-WG-006: Admin-Übergabe**
Wenn der WG-Admin die WG verlässt, soll das System die Admin-Rolle an das dienstälteste verbleibende Mitglied übertragen; verlässt das letzte Mitglied die WG, soll das System die WG archivieren.

**FR-WG-007: Datenisolation**
Das System soll sicherstellen, dass jeder Nutzer ausschließlich Daten der WG(s) lesen und schreiben kann, deren Mitglied er ist.

### Modul B — Aufgaben & rotierender Putzplan

**FR-TASK-001: Einmalige Aufgabe erstellen**
Wenn ein Mitglied eine Aufgabe mit Titel anlegt (optional: Beschreibung, Fälligkeitsdatum, zugewiesene Person), soll das System die Aufgabe speichern und in der Aufgabenliste der WG anzeigen.

**FR-TASK-002: Aufgabe erledigen**
Wenn ein Mitglied eine Aufgabe als erledigt markiert, soll das System Zeitstempel und erledigende Person speichern und die Aufgabe in die Historie verschieben.

**FR-TASK-003: Erledigung zurücknehmen**
Wenn eine erledigte Aufgabe innerhalb von 24 Stunden zurückgenommen wird, soll das System sie wieder als offen anzeigen.

**FR-ROTA-001: Rotationsaufgabe erstellen**
Wenn ein Mitglied eine wiederkehrende Aufgabe mit Intervall (täglich/wöchentlich/zweiwöchentlich/monatlich) und Teilnehmerkreis anlegt, soll das System eine Rotationsreihenfolge festlegen und die erste Instanz der ersten Person zuweisen.

**FR-ROTA-002: Automatische Rotation**
Wenn eine Rotationsaufgabe erledigt wird oder ihr Intervall abläuft, soll das System die nächste Instanz erzeugen und der nächsten Person in der Rotationsreihenfolge zuweisen.

**FR-ROTA-003: Faire Reihenfolge**
Das System soll die Rotationsreihenfolge so führen, dass jedes teilnehmende Mitglied gleich oft an der Reihe ist; neue Mitglieder werden ans Ende der Reihenfolge eingefügt.

**FR-ROTA-004: Überfällige Aufgabe**
Solange eine zugewiesene Aufgabe überfällig ist, soll das System sie in der Aufgabenliste visuell hervorheben und die zugewiesene Person täglich einmal erinnern (max. 3 Erinnerungen).

**FR-ROTA-005: Tauschen**
Wenn zwei Mitglieder einen Aufgabentausch bestätigen, soll das System die Zuweisungen der betroffenen Instanzen tauschen, ohne die langfristige Rotationsreihenfolge zu verändern.

**FR-TASK-004: Wochenübersicht**
Wenn ein Mitglied den Putzplan öffnet, soll das System eine Wochenansicht mit allen Aufgaben, Zuweisungen und Status (offen/erledigt/überfällig) anzeigen.

### Modul C — Einkaufsliste & Kosten-Splitting

**FR-SHOP-001: Artikel hinzufügen**
Wenn ein Mitglied einen Artikel mit Name (optional: Menge, Kategorie) hinzufügt, soll das System den Artikel speichern und ihn allen Mitgliedern in Echtzeit (< 3 s) anzeigen.

**FR-SHOP-002: Artikel abhaken**
Wenn ein Mitglied einen Artikel abhakt, soll das System ihn als gekauft markieren, die kaufende Person speichern und ihn in den Bereich „Zuletzt gekauft" verschieben.

**FR-SHOP-003: Duplikate**
Wenn ein Artikel hinzugefügt wird, dessen Name bereits offen auf der Liste steht, soll das System einen Hinweis anzeigen und das Zusammenführen anbieten.

**FR-SHOP-004: Wieder hinzufügen**
Wenn ein Mitglied einen Artikel aus „Zuletzt gekauft" antippt, soll das System ihn erneut auf die offene Liste setzen.

**FR-SHOP-005: Mehrere Listen**
Wenn ein Mitglied eine zusätzliche Liste anlegt (z. B. „Drogerie", „Getränke"), soll das System bis zu 10 benannte Listen pro WG unterstützen.

**FR-COST-001: Einkauf erfassen**
Wenn ein Mitglied beim Abhaken oder nachträglich einen Betrag zu einem Einkauf erfasst, soll das System eine Ausgabe mit Betrag, Zahler, Datum und beteiligten Mitgliedern (Standard: alle) anlegen.

**FR-COST-002: Aufteilung**
Wenn eine Ausgabe angelegt wird, soll das System den Betrag gleichmäßig auf die beteiligten Mitglieder aufteilen und Rundungsdifferenzen (Cent) dem Zahler gutschreiben.

**FR-COST-003: Salden**
Wenn ein Mitglied die Kostenübersicht öffnet, soll das System pro Mitglied den aktuellen Saldo („bekommt X € / schuldet Y €") sowie die vereinfachten Ausgleichszahlungen (minimale Anzahl Transaktionen) anzeigen.

**FR-COST-004: Ausgleich verbuchen**
Wenn ein Mitglied eine Ausgleichszahlung erfasst und der Empfänger sie bestätigt, soll das System die Salden beider Mitglieder entsprechend anpassen.

**FR-COST-005: Ausgabe korrigieren**
Wenn der Ersteller oder der Zahler eine Ausgabe bearbeitet oder löscht, soll das System alle betroffenen Salden neu berechnen und die Änderung in der Ausgaben-Historie protokollieren.

### Modul D — Bucketlist

**FR-BUCKET-001: Eintrag erstellen**
Wenn ein Mitglied einen Bucketlist-Eintrag mit Titel anlegt (optional: Beschreibung, Kategorie, Zieldatum), soll das System den Eintrag speichern und allen Mitgliedern anzeigen.

**FR-BUCKET-002: Abstimmen**
Wenn ein Mitglied für einen Eintrag stimmt, soll das System die Stimme speichern (eine pro Mitglied und Eintrag, zurücknehmbar) und die Liste nach Stimmenzahl sortierbar machen.

**FR-BUCKET-003: Als erlebt markieren**
Wenn ein Mitglied einen Eintrag als „erlebt" markiert, soll das System Datum zu speichern und den Eintrag in den Bereich „Erlebt" verschieben.

**FR-BUCKET-004: Foto anhängen**
Wenn ein Mitglied einem erlebten Eintrag ein Foto (JPEG/PNG/WebP, max. 10 MB) anhängt, soll das System das Bild komprimiert speichern und in der Detailansicht anzeigen.

**FR-BUCKET-005: Kommentare**
Wenn ein Mitglied einen Eintrag kommentiert, soll das System den Kommentar mit Autor und Zeitstempel speichern.

### Modul E — Benachrichtigungen

**FR-NOTIF-001: Push-Opt-in**
Wenn ein Mitglied Push-Benachrichtigungen aktiviert, soll das System die Web-Push-Subscription des Geräts registrieren.

**FR-NOTIF-002: Aufgaben-Erinnerung**
Wenn eine zugewiesene Aufgabe am aktuellen Tag fällig ist, soll das System der zugewiesenen Person um 09:00 Uhr lokaler Zeit eine Erinnerung senden.

**FR-NOTIF-003: Ereignis-Benachrichtigungen**
Wenn ein neues Mitglied beitritt, eine Aufgabe einem Mitglied zugewiesen wird oder eine Ausgabe erfasst wird, die ein Mitglied betrifft, soll das System den betroffenen Mitgliedern eine Benachrichtigung senden.

**FR-NOTIF-004: Einstellungen**
Wo Benachrichtigungen aktiviert sind, soll das System pro Kategorie (Aufgaben, Einkauf, Kosten, Bucketlist) eine separate An/Aus-Einstellung anbieten.

**FR-NOTIF-005: Kein Selbst-Spam**
Das System soll keinem Mitglied Benachrichtigungen über seine eigenen Aktionen senden.

### Modul F — PWA & Offline

**FR-PWA-001: Installierbarkeit**
Das System soll ein Web-App-Manifest und einen Service Worker bereitstellen, sodass die App auf iOS und Android zum Homescreen hinzugefügt werden kann.

**FR-PWA-002: Offline-Lesen**
Solange keine Netzverbindung besteht, soll das System die zuletzt geladenen Aufgaben, Einkaufslisten und Bucketlist lesbar anzeigen und den Offline-Zustand kennzeichnen.

**FR-PWA-003: Offline-Abhaken**
Solange keine Netzverbindung besteht, wenn ein Mitglied einen Einkaufsartikel abhakt oder hinzufügt, soll das System die Änderung lokal puffern und bei Wiederverbindung synchronisieren.

**FR-PWA-004: Konfliktauflösung**
Wenn beim Synchronisieren zwei Änderungen am selben Objekt kollidieren, soll das System die Strategie „letzter Schreiber gewinnt" anwenden, außer beim Abhaken: einmal gekauft bleibt gekauft.

---

## Nicht-funktionale Anforderungen

### Performance
- API-Antwortzeit: < 200 ms p95 (Lesezugriffe), < 500 ms p95 (Schreibzugriffe)
- First Contentful Paint auf Mittelklasse-Smartphone (4G): < 2 s
- Echtzeit-Sync (Einkaufsliste): Änderungen bei anderen Mitgliedern sichtbar in < 3 s
- Datenvolumen: bis 10 000 Objekte pro WG ohne spürbare Verlangsamung

### Sicherheit
- Passwörter: bcrypt/argon2-Hashing, nie im Klartext
- Transport: ausschließlich HTTPS/TLS 1.2+
- Autorisierung: jede API-Route prüft WG-Mitgliedschaft serverseitig (kein Vertrauen in Client-Daten)
- Einladungscodes: kryptografisch zufällig, erneuerbar, kein Enumerieren möglich (Rate-Limit)
- Eingaben: serverseitige Validierung aller Felder; Ausgaben-Beträge als Integer-Cent gespeichert (keine Float-Rundungsfehler)
- DSGVO: Konto-Löschung entfernt personenbezogene Daten; Beiträge werden anonymisiert („Ehemaliges Mitglied"); Datenexport auf Anfrage
- Rate-Limiting auf Auth-Endpunkten (Login, Registrierung, Code-Eingabe)

### Verfügbarkeit & Skalierung
- Zielgröße: 1 000 WGs / 5 000 Nutzer im ersten Jahr (bewusst klein dimensioniert, monolithisches Backend ausreichend)
- Verfügbarkeit: 99,5 % monatlich
- Backups: täglich, 30 Tage Aufbewahrung

### Usability
- Mobile-first, Bedienung einhändig möglich; Kernaktionen (Artikel hinzufügen, Aufgabe abhaken) in max. 2 Taps
- Sprache: Deutsch (i18n-fähig für spätere Sprachen)
- Barrierefreiheit: WCAG 2.1 AA für Kontraste und Fokus-Reihenfolge

---

## Akzeptanzkriterien (Given/When/Then)

### AC-001: WG gründen und Mitbewohner einladen
Gegeben ein registrierter Nutzer ohne WG,
wenn er eine WG „Sonnenallee 12" erstellt und den Einladungscode an einen zweiten registrierten Nutzer weitergibt, der ihn eingibt,
dann sind beide Mitglieder derselben WG und sehen dieselben Listen.

### AC-002: Rotierender Putzplan
Gegeben eine WG mit 3 Mitgliedern (A, B, C) und eine wöchentliche Rotationsaufgabe „Bad putzen", aktuell A zugewiesen,
wenn A die Aufgabe als erledigt markiert,
dann wird eine neue Instanz mit Fälligkeit in der Folgewoche erzeugt und B zugewiesen; nach B folgt C, danach wieder A.

### AC-003: Überfällige Aufgabe
Gegeben eine Aufgabe mit Fälligkeit gestern, die nicht erledigt wurde,
wenn ein Mitglied den Putzplan öffnet,
dann ist die Aufgabe als überfällig hervorgehoben und die zugewiesene Person hat eine Erinnerung erhalten.

### AC-004: Einkaufsliste in Echtzeit
Gegeben zwei Mitglieder derselben WG haben die Einkaufsliste geöffnet,
wenn Mitglied A „Hafermilch" hinzufügt,
dann erscheint der Artikel bei Mitglied B innerhalb von 3 Sekunden ohne manuelles Neuladen.

### AC-005: Kosten-Splitting mit Rundung
Gegeben eine WG mit 3 Mitgliedern,
wenn Mitglied A einen Einkauf über 10,00 € für alle erfasst,
dann schulden B und C jeweils 3,33 € an A und As Saldo beträgt +6,66 € (Rundungsdifferenz von 0,01 € zugunsten des Zahlers).

### AC-006: Ausgleich
Gegeben Mitglied B schuldet Mitglied A 3,33 €,
wenn B eine Ausgleichszahlung über 3,33 € erfasst und A sie bestätigt,
dann beträgt der Saldo zwischen A und B 0,00 €.

### AC-007: Bucketlist-Abstimmung
Gegeben eine Bucketlist mit den Einträgen „Campingwochenende" (0 Stimmen) und „Kochabend" (2 Stimmen),
wenn ein Mitglied für „Campingwochenende" stimmt und nach Stimmen sortiert,
dann steht „Kochabend" (2) vor „Campingwochenende" (1), und das Mitglied kann seine Stimme wieder zurücknehmen.

### AC-008: Offline-Abhaken
Gegeben ein Mitglied hat die Einkaufsliste geladen und verliert die Netzverbindung,
wenn es im Supermarkt 5 Artikel abhakt und danach wieder online ist,
dann sind alle 5 Artikel serverseitig als gekauft markiert und bei den anderen Mitgliedern sichtbar.

### AC-009: Datenisolation
Gegeben zwei verschiedene WGs X und Y,
wenn ein Mitglied von X versucht, per direkter API-Anfrage eine Aufgabe von Y zu lesen oder zu ändern,
dann lehnt das System die Anfrage mit 403 ab.

### AC-010: Mitglied verlässt WG
Gegeben ein Mitglied mit 2 offenen Rotationsaufgaben und einem Saldo von −5,00 €,
wenn es die WG verlässt,
dann werden seine Aufgaben-Instanzen den verbleibenden Mitgliedern per Rotation neu zugewiesen, sein Saldo bleibt in der Kostenübersicht als „ehemaliges Mitglied" sichtbar, und es hat keinen Zugriff mehr auf WG-Inhalte.

---

## Fehlerbehandlung

| Fehlerfall | HTTP-Code | Nutzer-Meldung |
|---|---|---|
| Ungültige Eingabe (Validierung) | 400 | „Bitte überprüfe deine Eingabe." |
| Nicht angemeldet / Token abgelaufen | 401 | „Bitte melde dich an." |
| Kein Mitglied dieser WG | 403 | „Du hast keinen Zugriff auf diese WG." |
| Objekt nicht gefunden / gelöscht | 404 | „Dieser Eintrag existiert nicht mehr." |
| Einladungscode ungültig | 404 | „Dieser Einladungscode ist ungültig oder abgelaufen." |
| E-Mail bereits registriert | 409 | „Für diese E-Mail existiert bereits ein Konto." |
| Gleichzeitige Bearbeitung (Konflikt) | 409 | „Der Eintrag wurde inzwischen geändert — bitte aktualisieren." |
| Zu viele Versuche (Rate-Limit) | 429 | „Zu viele Versuche. Bitte warte kurz." |
| Foto zu groß / falsches Format | 413/415 | „Bild max. 10 MB (JPEG, PNG oder WebP)." |
| Serverfehler | 500 | „Etwas ist schiefgelaufen. Bitte versuche es erneut." |
| Offline bei Schreibaktion | — (Client) | „Du bist offline — Änderung wird synchronisiert, sobald du wieder online bist." |

---

## Implementierungs-Checkliste

### Phase 1 — Fundament (MVP-Basis)
- [ ] Projekt-Setup: Frontend (z. B. Vue 3 + Vite, PWA-Plugin), Backend (z. B. Node/Fastify oder Laravel), PostgreSQL
- [ ] Datenmodell & Migrationen: `users`, `wgs`, `memberships`, `invite_codes`
- [ ] Auth: Registrierung, Login, Refresh-Token, Passwort-Reset, Rate-Limiting
- [ ] WG erstellen / beitreten / verlassen, Einladungscode-Flow, Admin-Rolle
- [ ] Autorisierungs-Middleware: WG-Mitgliedschaft auf jeder Route
- [ ] App-Shell: Navigation (Aufgaben / Einkauf / Bucketlist / Kosten / Einstellungen), responsives Layout

### Phase 2 — Aufgaben & Putzplan
- [ ] Migrationen: `tasks`, `task_instances`, `rotations`, `rotation_members`
- [ ] CRUD einmalige Aufgaben + Erledigen/Zurücknehmen
- [ ] Rotations-Engine: Instanz-Erzeugung, faire Reihenfolge, Scheduler-Job für Intervalle
- [ ] Wochenansicht Putzplan, Überfällig-Markierung
- [ ] Tausch-Funktion mit Bestätigung

### Phase 3 — Einkaufsliste & Kosten
- [ ] Migrationen: `shopping_lists`, `items`, `expenses`, `expense_shares`, `settlements`
- [ ] Echtzeit-Sync (WebSocket oder SSE) für Listen
- [ ] Artikel-CRUD, Abhaken, „Zuletzt gekauft", Duplikat-Hinweis
- [ ] Ausgaben erfassen (Integer-Cent), Split-Berechnung, Saldenansicht, Ausgleichs-Flow
- [ ] Ausgaben-Historie mit Änderungsprotokoll

### Phase 4 — Bucketlist
- [ ] Migrationen: `bucket_items`, `bucket_votes`, `bucket_comments`, `attachments`
- [ ] CRUD Einträge, Abstimmen, „Erlebt"-Flow
- [ ] Foto-Upload mit serverseitiger Kompression und Größen-/Format-Validierung

### Phase 5 — Benachrichtigungen & PWA
- [ ] Web-Push: Subscription-Verwaltung, VAPID-Keys, Einstellungs-UI pro Kategorie
- [ ] Scheduler: tägliche Fälligkeits-Erinnerungen (09:00 lokal), Überfällig-Erinnerungen
- [ ] Ereignis-Benachrichtigungen (Beitritt, Zuweisung, Ausgabe)
- [ ] Service Worker: App-Shell-Caching, Offline-Lesecache, Schreib-Queue mit Sync
- [ ] Konfliktstrategie implementieren und testen

### Tests & Qualität
- [ ] Unit-Tests: Rotations-Engine, Split-Berechnung (inkl. Rundung), Saldo-Vereinfachung
- [ ] Integrationstests: Auth-Flows, Autorisierung (AC-009), Ausgaben-Korrektur
- [ ] E2E-Tests (Playwright): AC-001, AC-002, AC-004, AC-005, AC-008
- [ ] Lighthouse: PWA-Installierbarkeit, Performance-Budget FCP < 2 s
- [ ] Security-Check: Rate-Limits, IDOR-Tests (fremde WG-IDs), Eingabe-Validierung

---

## Nicht im Umfang (v1)

- Punkte-/Gamification-System und Fairness-Statistiken (bewusst zurückgestellt)
- Social Login (Google/Apple)
- Native Apps (iOS/Android) — PWA deckt v1 ab
- Rezepte, Vorratsverwaltung, Barcode-Scanner
- Anbindung an Zahlungsdienste (PayPal, Banküberweisung) — Ausgleich wird nur verbucht
- Mehrere WG-Mitgliedschaften pro Nutzer gleichzeitig (Datenmodell lässt es zu, UI zeigt v1 nur eine WG)
- Kalender-Integration (iCal-Export)

## Offene Fragen

- [ ] Sollen Ausgaben auch ungleich gesplittet werden können (Anteile/Prozente), oder reicht Gleichverteilung für v1?
- [ ] iOS-Web-Push erfordert die installierte PWA (Homescreen) — reicht das, oder ist ein E-Mail-Fallback für Erinnerungen nötig?
- [ ] Tech-Stack final festlegen (Vorschlag: Vue 3 + Vite PWA, Node-Backend, PostgreSQL — passend zu vorhandener Vue-Erfahrung)
- [ ] Hosting/Budget: eigener Server vs. Managed (z. B. Railway/Fly.io + Supabase)?
