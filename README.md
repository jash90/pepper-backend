# Pepper Backend API

Backend API dla aplikacji wyświetlającej i kategoryzującej oferty z serwisu Pepper.pl, używający OpenAI do kategoryzacji i Supabase do cache.

## Funkcje

- Pobieranie artykułów z Pepper.pl przez scraping
- Kategoryzacja artykułów przy pomocy OpenAI lub dopasowywania słów kluczowych
- Cache kategoryzowanych artykułów w Supabase
- Obsługa polityk Row Level Security (RLS) w Supabase
- Statystyki i zarządzanie cache

## Wymagania

- Node.js >= 18.0.0
- Konto w [Supabase](https://supabase.com/)
- Opcjonalnie: Klucz API do [OpenAI](https://openai.com/)

## Instalacja

```bash
# Klonowanie repozytorium (jeśli nie zostało już sklonowane)
git clone <repozytorium>
cd pepper-backend

# Instalacja zależności
npm install

# Skopiowanie pliku .env.example do .env
cp .env.example .env

# Edycja pliku .env i dodanie wymaganych kluczy
nano .env
```

## Konfiguracja

W pliku `.env` należy ustawić następujące zmienne środowiskowe:

```ini
# Supabase
SUPABASE_URL=https://your-project-url.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
SUPABASE_ANON_KEY=your-anon-key

# OpenAI (opcjonalnie, jeśli ma być używana kategoryzacja AI)
OPENAI_API_KEY=your-openai-api-key

# Ustawienia aplikacji
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

## Utworzenie tabeli w Supabase

W projekcie Supabase należy utworzyć tabelę `categorized_articles` o następującej strukturze:

```sql
CREATE TABLE categorized_articles (
  article_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  price TEXT,
  shipping_price TEXT,
  image TEXT,
  link TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indeks dla szybszego wyszukiwania
CREATE INDEX categorized_articles_category_idx ON categorized_articles(category);
CREATE INDEX categorized_articles_created_at_idx ON categorized_articles(created_at);
```

## Uruchomienie

```bash
# Tryb deweloperski z auto-restartowaniem
npm run dev

# Tryb produkcyjny
npm start
```

Serwer domyślnie działa na porcie 5000, chyba że PORT jest inaczej ustawiony w pliku `.env`.

## Endpointy API

### Artykuły

- `GET /api/articles` - Pobieranie artykułów z Pepper.pl z określonej strony
  - Query Params: `page` (domyślnie 1)
- `GET /api/articles/multi` - Pobieranie artykułów z wielu stron Pepper.pl
  - Query Params: `pages` (domyślnie 3, max 10)

### Kategoryzacja

- `POST /api/categorize` - Kategoryzacja artykułów przy pomocy OpenAI lub słów kluczowych
  - Request body: `{ articles: Article[] }`
- `GET /api/categorize/categories` - Pobieranie listy dostępnych kategorii

### Cache

- `GET /api/cache` - Pobieranie skategoryzowanych artykułów z cache
  - Query Params: `days` (domyślnie 7), `limit` (domyślnie 500, max 1000)
- `POST /api/cache/lookup` - Sprawdzanie cache dla linków artykułów
  - Request body: `{ links: string[] }`
- `DELETE /api/cache/purge` - Usuwanie danych z cache
  - Query Params: `mode` ('all' lub 'older_than_days'), `days` (domyślnie 30)
- `GET /api/cache/stats` - Statystyki cache

### Supabase

- `GET /api/supabase/check` - Sprawdzanie połączenia z Supabase
- `POST /api/supabase/fix-rls` - Naprawianie polityk RLS (Row Level Security)
- `GET /api/supabase/check-rls` - Sprawdzanie statusu polityk RLS

## Struktura projektu

```
pepper-backend/
├── src/
│   ├── index.js            # Główny plik aplikacji
│   ├── lib/                # Biblioteki i moduły
│   │   ├── openai.js       # Klient OpenAI
│   │   ├── scraper.js      # Scraper dla Pepper.pl
│   │   └── supabase.js     # Klient Supabase
│   └── routes/             # Routery Express dla endpointów API
│       ├── articles.js     # Endpointy dla artykułów
│       ├── cache.js        # Endpointy dla zarządzania cache
│       ├── categorize.js   # Endpointy dla kategoryzacji
│       └── supabase.js     # Endpointy dla zarządzania Supabase
├── .env.example            # Przykładowy plik konfiguracyjny
├── .gitignore              # Plik gitignore
├── package.json            # Plik package.json
└── README.md               # Ten plik README
```

## Licencja

MIT 