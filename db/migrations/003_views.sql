-- 003_views.sql
-- Подання для каталогу: товар разом з категорією, продавцем і рейтингом.
-- Показує лише активні товари схвалених продавців.

CREATE VIEW catalog_products AS
SELECT p.id,
       p.name,
       p.description,
       p.price,
       p.unit,
       p.stock,
       p.image_url,
       p.created_at,
       p.category_id,
       c.name  AS category_name,
       c.slug  AS category_slug,
       p.seller_id,
       s.shop_name,
       s.city  AS seller_city,
       COALESCE(r.avg_rating, 0)::NUMERIC(3, 2) AS rating,
       COALESCE(r.reviews_count, 0)::INTEGER    AS reviews_count
FROM products p
JOIN categories c ON c.id = p.category_id
JOIN sellers s    ON s.id = p.seller_id
JOIN users u      ON u.id = s.user_id
LEFT JOIN (
    SELECT product_id, AVG(rating) AS avg_rating, COUNT(*) AS reviews_count
    FROM reviews
    GROUP BY product_id
) r ON r.product_id = p.id
WHERE p.is_active
  AND s.status = 'approved'
  AND NOT u.is_blocked;
