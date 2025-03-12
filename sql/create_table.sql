-- Tworzenie tabeli do przechowywania skategoryzowanych artykułów
CREATE TABLE
    categorized_articles (
        article_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        price TEXT,
        shipping_price TEXT,
        image TEXT,
        link TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at TIMESTAMP
        WITH
            TIME ZONE DEFAULT NOW ()
    );

-- Indeksy dla szybszego wyszukiwania
CREATE INDEX categorized_articles_category_idx ON categorized_articles (category);

CREATE INDEX categorized_articles_created_at_idx ON categorized_articles (created_at);

-- Włączenie RLS (Row Level Security)
ALTER TABLE categorized_articles ENABLE ROW LEVEL SECURITY;

-- Polityki RLS
-- Polityka, która pozwala użytkownikom anonimowym TYLKO na odczyt
CREATE POLICY "Anon can read" ON categorized_articles FOR
SELECT
    USING (true);

-- Polityka, która pozwala klientowi serwisowemu na INSERT
CREATE POLICY "Service can insert" ON categorized_articles FOR INSERT
WITH
    CHECK (true);

-- Polityka, która pozwala klientowi serwisowemu na UPDATE
CREATE POLICY "Service can update" ON categorized_articles FOR
UPDATE USING (true)
WITH
    CHECK (true);

-- Polityka, która pozwala klientowi serwisowemu na DELETE
CREATE POLICY "Service can delete" ON categorized_articles FOR DELETE USING (true);

-- Sprawdzenie, czy polityki zostały utworzone
SELECT
    *
FROM
    pg_policies
WHERE
    tablename = 'categorized_articles';