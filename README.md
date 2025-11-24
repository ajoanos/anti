# Pytania dla par – MVP

Lekki projekt webowy (PHP 8 + SQLite + Vanilla JS) do losowania pytań dla par, zapisywania reakcji w czasie rzeczywistym oraz prowadzenia rytuałów bliskości w grze **Plan Wieczoru – We Dwoje**.

## Wymagania

- PHP 8.0+ z rozszerzeniami `pdo_sqlite` lub `sqlite3`
- Uprawnienia zapisu do katalogów `db/` oraz `data/`

## Uruchomienie

1. Skopiuj katalog `pary-mvp/` na hosting lub do środowiska lokalnego obsługującego PHP.
2. Upewnij się, że katalog `db/` jest pusty i ma prawa zapisu (plik bazy zostanie utworzony automatycznie przy pierwszym żądaniu API).
3. Wejdź w przeglądarce na `index.html`, podaj kod pokoju oraz swoje imię i dołącz do gry.

## Import pytań

- Formularz importu jest dostępny pod adresem `admin-import.html`.
- Wklej listę pytań w formacie JSON (lista obiektów z polami `id`, `category`, `text`).
- Brak autoryzacji – to MVP testowe, korzystaj rozważnie.

## PWA

- Aplikacja udostępnia manifest i Service Workera cache’ującego statyczne zasoby oraz seed pytań.
- Odczyt i synchronizacja odpowiedzi wymaga połączenia z API (online).

## Struktura bazy danych

Baza SQLite tworzona jest automatycznie z tabelami:
- `rooms`
- `participants`
- `session_questions`
- `reactions`

Klucz pokoju jest zapisywany wielkimi literami, a reakcje są nadpisywane (UPSERT) dla pary `participant/question`.
