# Smart Dairy Farm Management System

Production-oriented starter for the phased dairy-farm SaaS described in `farm1.pdf`.
It implements the platform foundation: PostgreSQL schema, authentication/RBAC, audit logs,
farm-scoped cow and milk APIs, and a responsive React dashboard.

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:5173`. The API runs at `http://localhost:4000/api/v1`.
The seeded administrator is `admin@greenfield.test` / `ChangeMe123!`; change it outside
development immediately.

## Local development

```bash
cp .env.example .env
docker compose up -d db          # start PostgreSQL (seeded automatically)
npm install
npm run migrate --workspace=server   # apply database/migrations
npm run seed --workspace=server      # load demo data (3 farms, cows, milk, finance…)
```

Run the API and web app separately:

```bash
npm run dev --workspace=server     # API on http://localhost:4000/api/v1
VITE_API_URL=http://localhost:4000/api/v1 npm run dev --workspace=web
```

When `VITE_API_URL` is set the web app authenticates against the real API and
fetches all dashboard/herd/analytics/finance data from PostgreSQL, with mock data
used as a fallback when the API is unreachable. Leave it unset to run the demo
entirely on the built-in mock dataset (no backend required).

Seeded accounts (password `ChangeMe123!`):
`admin@greenfield.test` (administrator, can switch farms),
`manager@greenfield.test`, `admin@sunrise.test`, `manager@highland.test`.

## Backend (`apps/server`)

A TypeScript + Express + `node-postgres` API. Auth uses JWT (signed with `JWT_SECRET`);
passwords are hashed with Postgres `pgcrypto` (`crypt`). Role-based access is enforced via
the `roles` / `permissions` / `role_permissions` tables and an `audit_logs` row is written
for mutating actions.

Endpoints (all under `/api/v1`, protected routes require `Authorization: Bearer <token>`):

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET /farms`, `GET /farms/:id/summary`
- `GET|POST /cows`, `GET|PATCH|DELETE /cows/:id` (farm-scoped; admins may pass `?farmId=`)
- `GET|POST /milk-records` (`?farmId=` for admins)
- `GET /dashboard/summary`, `/dashboard/milk-trend`, `/dashboard/income-expense`,
  `/dashboard/feed-consumption`, `/dashboard/breed-population`, `/dashboard/health-distribution`
- `GET /predictions`, `GET /analytics`, `GET /finance`, `GET /weather`, `GET /sustainability`,
  `GET /notifications` (all farm-scoped, `?farmId=` for admins)

List endpoints support `page`, `pageSize`, `search`, `breed`, `health`, `pregnant`, `gender`.

## API overview
`POST /auth/register`, `POST /auth/login`, `GET /auth/me`

`GET|POST /cows`, `GET|PATCH|DELETE /cows/:id`

`GET|POST /milk-records`, `GET /dashboard/summary`

All protected routes require `Authorization: Bearer <token>`. List endpoints support `page`,
`pageSize`, `search`, and `status` where applicable. The OpenAPI starter is in
`docs/openapi.yaml`.

## Phased delivery

The schema includes normalized foundations for feeding, breeding, veterinary, calves, finance,
employees, inventory, sales, notifications, and audit logs. Build their controllers and screens
in the order set out in the supplied brief after validating the authentication/cow/milk workflow.
