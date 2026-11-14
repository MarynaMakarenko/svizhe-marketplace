-- 002_indexes.sql
-- Індекси під основні запити: каталог, кабінети, історія замовлень.

CREATE INDEX idx_products_category ON products (category_id) WHERE is_active;
CREATE INDEX idx_products_seller   ON products (seller_id);
CREATE INDEX idx_products_created  ON products (created_at DESC);
-- Пошук за назвою без урахування регістру
CREATE INDEX idx_products_name_lower ON products (lower(name) varchar_pattern_ops);

CREATE INDEX idx_orders_buyer  ON orders (buyer_id, created_at DESC);
CREATE INDEX idx_orders_seller ON orders (seller_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders (status);

CREATE INDEX idx_order_items_order   ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);
CREATE INDEX idx_reviews_product     ON reviews (product_id);
