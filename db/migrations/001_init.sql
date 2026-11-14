-- 001_init.sql
-- Початкова схема бази даних маркетплейсу «Свіже».

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(120) NOT NULL,
    phone         VARCHAR(30),
    role          VARCHAR(10)  NOT NULL DEFAULT 'buyer'
                  CHECK (role IN ('buyer', 'seller', 'admin')),
    is_blocked    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Профіль продавця: один користувач з роллю seller = один магазин.
CREATE TABLE sellers (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER      NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    shop_name   VARCHAR(120) NOT NULL UNIQUE,
    description TEXT         NOT NULL DEFAULT '',
    city        VARCHAR(80)  NOT NULL DEFAULT '',
    status      VARCHAR(10)  NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE categories (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE,
    slug VARCHAR(80) NOT NULL UNIQUE,
    icon VARCHAR(16) NOT NULL DEFAULT '🛒'
);

CREATE TABLE products (
    id          SERIAL PRIMARY KEY,
    seller_id   INTEGER        NOT NULL REFERENCES sellers (id) ON DELETE CASCADE,
    category_id INTEGER        NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
    name        VARCHAR(160)   NOT NULL,
    description TEXT           NOT NULL DEFAULT '',
    price       NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    unit        VARCHAR(20)    NOT NULL DEFAULT 'шт',
    stock       INTEGER        NOT NULL DEFAULT 0 CHECK (stock >= 0),
    image_url   VARCHAR(500),
    is_active   BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);

-- Одне замовлення належить одному продавцю: кошик з товарами
-- кількох продавців під час оформлення ділиться на кілька замовлень.
CREATE TABLE orders (
    id               SERIAL PRIMARY KEY,
    buyer_id         INTEGER        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    seller_id        INTEGER        NOT NULL REFERENCES sellers (id) ON DELETE RESTRICT,
    status           VARCHAR(12)    NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'confirmed', 'shipped', 'delivered', 'cancelled')),
    total            NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
    delivery_address VARCHAR(300)   NOT NULL,
    phone            VARCHAR(30)    NOT NULL,
    comment          TEXT           NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- Назва й ціна копіюються в позицію замовлення, щоб історія
-- не змінювалась, коли продавець редагує або видаляє товар.
CREATE TABLE order_items (
    id           SERIAL PRIMARY KEY,
    order_id     INTEGER        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id   INTEGER        REFERENCES products (id) ON DELETE SET NULL,
    product_name VARCHAR(160)   NOT NULL,
    unit         VARCHAR(20)    NOT NULL DEFAULT 'шт',
    price        NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    quantity     INTEGER        NOT NULL CHECK (quantity > 0)
);

CREATE TABLE reviews (
    id         SERIAL PRIMARY KEY,
    product_id INTEGER  NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    user_id    INTEGER  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT     NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, user_id)
);
