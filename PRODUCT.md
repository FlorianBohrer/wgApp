# Product

## Register

product

## Users

Mitbewohner:innen in Wohngemeinschaften (2–8 Personen), meist junge Erwachsene / Studierende / Berufseinsteiger. Kontext: unterwegs, mobil, zwischendurch — im Supermarkt beim Abhaken, am Küchentisch beim Putzplan-Klären, abends beim Sammeln von WG-Plänen. Sie wollen typische WG-Reibung ohne Diskussion lösen: „Wer war mit dem Bad dran?", „Wer hat das bezahlt?", „Was steht noch auf der Einkaufsliste?". Kein Power-User-Publikum — die App muss ohne Erklärung bedienbar sein, oft einhändig.

## Product Purpose

Eine gemeinsame WG-App (PWA) für drei Kernbereiche: **Aufgaben** mit fair rotierendem Putzplan, gemeinsame **Einkaufslisten** mit Echtzeit-Sync und Kosten-Splitting, sowie eine gemeinsame **Bucketlist**. Sie existiert, um Zuständigkeit, Ausgaben und Pläne transparent zu machen und WG-Konflikte durch Klarheit statt Diskussion zu vermeiden. Erfolg = die WG ersetzt Zettel + Gruppenchat + „Wer ist dran?"-Streit durch eine App, die alle freiwillig täglich öffnen. Vollständige Anforderungen: siehe [wg-app.spec.md](wg-app.spec.md).

## Brand Personality

Frisch, farbig, sozial. Die App fühlt sich lebendig und gemeinschaftlich an — mehr wie ein geteilter Raum als ein Verwaltungs-Tool. Fotos (erlebte Bucketlist-Momente) und Menschen (wer was macht, wer wem was schuldet) stehen sichtbar im Vordergrund. Ton: locker, direkt, deutsch, per Du; nie belehrend oder bürokratisch. Kleine soziale Signale (Avatare, „erledigt von", Abstimmungen) tragen die Wärme — nicht Deko. Farbe wird eingesetzt, um Personen und Zustände zu unterscheiden, nicht um zu dekorieren.

## Anti-references

- **Kein Gamer/Neon-Look**: keine dunklen RGB-Flächen, keine übertriebenen Glows oder Cyber-Ästhetik.
- **Kein Enterprise/SaaS-Grau**: nicht steril, korporativ oder admin-panel-langweilig. Die App ist privat und sozial, kein Arbeitswerkzeug.
- **Kein kindisches Sticker-Chaos**: verspielt ja, aber nicht überladen mit bunten Emojis, Comic-Illustrationen oder Sticker-Wänden.
- **Kein Cream/Sand-Editorial**: nicht der warm-beige „Magazin"-Look (parchment/paper/linen), der gerade überall in AI-Designs auftaucht.

## Design Principles

1. **Menschen sichtbar machen.** Wer eine Aufgabe hat, wer bezahlt hat, wer abgestimmt hat — Personen (Avatare, Namen, Farben) sind erste-Klasse-Elemente, nicht Fußnoten. Die WG soll sich in der App wiedererkennen.
2. **Zwei-Tap-Regel.** Die häufigsten Aktionen (Artikel hinzufügen, Aufgabe abhaken, Einkauf erfassen) müssen mobil, einhändig, in max. zwei Taps gehen. Reibung ist der Feind der täglichen Nutzung.
3. **Klarheit vor Vollständigkeit.** Lieber ein ruhiger Blick auf „was ist gerade dran / was schulde ich" als jede Info gleichzeitig. Zustände (offen / erledigt / überfällig, Saldo +/−) sind sofort lesbar.
4. **Fair by design.** Rotation und Kostenaufteilung sind nachvollziehbar und sichtbar gerecht — die Logik darf nie wie eine Blackbox wirken, sonst entsteht neuer Streit.
5. **Farbe arbeitet, Deko nicht.** Jede Farbe hat eine Bedeutung (Person, Zustand, Kategorie). Lebendigkeit entsteht durch sinnvolle Farbe und Fotos, nicht durch Verzierung.

## Accessibility & Inclusion

WCAG 2.1 AA als Ziel: Körpertext ≥ 4,5:1 Kontrast, große Schrift/UI ≥ 3:1. Farbe nie als einziger Bedeutungsträger (Personen zusätzlich per Avatar/Initialen/Label unterscheidbar — wichtig bei Farbfehlsichtigkeit, da Personenfarben zentral sind). Vollständige Tastatur- und Screenreader-Bedienbarkeit der Kernflows. `prefers-reduced-motion` respektieren (Crossfade/instant statt Bewegung). Mobile-first, große Touch-Targets (≥ 44px), einhändige Bedienung. Sprache Deutsch, i18n-fähig für später.
