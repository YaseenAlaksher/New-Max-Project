# PHI API Documentation

Base URL: `http://localhost:3001`

## Public

- `GET /api/public/products`
- `GET /api/public/inventory`
- `GET /api/public/settings`
- `GET /api/public/banners`
- `GET /api/public/reviews?productId=&limit=12`
- `POST /api/public/reviews`
- `POST /api/public/product-views/:id`
- `POST /api/orders`

## Admin

Requires `Authorization: Bearer <token>`.

- `POST /api/auth/login`
- `POST /api/auth/change-password`
- `GET/PUT/POST/DELETE /api/products`
- `GET/PUT/DELETE /api/orders`
- `GET /api/orders/export.csv`
- `GET /api/stats`
- `GET/PUT /api/settings`
- `GET/POST/PUT/DELETE /api/banners`
- `GET/PUT/DELETE /api/reviews`
