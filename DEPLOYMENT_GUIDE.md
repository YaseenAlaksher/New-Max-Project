# Deployment Guide

## Backend

Recommended environment variables:

- `NODE_ENV=production`
- `JWT_SECRET`
- `DEFAULT_ADMIN_USER`
- `DEFAULT_ADMIN_PASSWORD`
- `CORS_ORIGINS=https://your-store-domain.com`
- `DB_PATH`
- `UPLOAD_DIR`
- `ADMIN_EMAIL`
- `EMAIL_WEBHOOK_URL` or `RESEND_API_KEY` / SMTP variables

Use persistent storage for SQLite and uploads.

## Frontend

Deploy `store` as static files and update `CONFIG.API_URL` if the backend URL changes.
