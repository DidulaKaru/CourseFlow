# CourseFlow Production Deployment Guide (100% Free Tier Stack)

This guide provides end-to-end instructions for deploying CourseFlow completely on generous, production-ready free tiers:
- **Frontend:** [Cloudflare Pages](https://pages.cloudflare.com) (Unlimited bandwidth, global CDN, instant atomic deploys).
- **Backend:** [Vercel](https://vercel.com) (Python 3.11+ Serverless Functions, global edge routing).
- **Database:** [Neon](https://neon.tech) (Serverless PostgreSQL with connection pooling & pgvector).

```mermaid
flowchart LR
    User["Student Browser"] -->|"1. Static Assets & React SPA"| CF["Cloudflare Pages (Global CDN)"]
    User -->|"2. API Requests (/api/*)"| Vercel["Vercel Serverless (FastAPI)"]
    Vercel -->|"3. PgBouncer Pooler (sslmode=require)"| Neon["Neon Serverless PostgreSQL"]
```

---

## 1. Database: Neon PostgreSQL (Free Tier)

Neon provides 0.5 GiB of storage, autoscaling compute, and native connection pooling at zero cost.

### Step 1: Create a Neon Project
1. Sign up or log in at [console.neon.tech](https://console.neon.tech).
2. Click **Create Project**:
   - **Name:** `courseflow-db`
   - **Postgres Version:** 16 (or latest)
   - **Region:** Choose the region closest to your target audience (e.g., `AWS us-east-2` or `eu-central-1`).
3. Click **Create Project**.

### Step 2: Obtain Connection String
1. In the Neon Dashboard, locate the **Connection Details** card.
2. Select **Pooled connection** (ensure the connection string hostname includes `-pooler`).
3. Copy the full connection string:
   ```text
   postgresql://neondb_owner:npg_password@ep-cool-fog-12345678-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### Step 3: Initialize Database Schema & Seed Data
From your local terminal, run the CourseFlow idempotent database seeder pointing to your Neon database:

```powershell
# Set your Neon connection string in your shell or .env
$env:DATABASE_URL="postgresql://neondb_owner:npg_password@ep-cool-fog-12345678-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Execute database migration and curriculum seeding
python backend/scripts/seed_db.py
```

This creates all PostgreSQL tables (`degree_programs`, `courses`, `prerequisite_rules`, `credit_distributions`, `course_evaluations`) and populates Computer Engineering & Electrical Engineering curriculums.

### Step 4: Apply Schema Migrations

Schema changes ship as Alembic revisions (`0001_initial_curriculum_tables`, `0002_course_updated_at`, ...). Run them against the same `DATABASE_URL` from the `backend/` directory:

```powershell
cd backend

# New database: migrate first, then seed
python -m alembic upgrade head
python scripts/seed_db.py

# Existing database created before Alembic was used (by seed_db.py alone, so it has no alembic_version table):
# mark it as being at the initial revision once, then upgrade
python -m alembic stamp 0001_initial_curriculum_tables
python -m alembic upgrade head
```

Without the `stamp` step, `upgrade head` fails on an existing database with "table already exists". Run `python -m alembic current` to confirm the database is at `head`. Re-run `upgrade head` after every release that adds a revision (CF-202 adds `courses.updated_at`).

---

## 2. Backend: Vercel Serverless (Free Hobby Tier)

Vercel provides 100GB-hours/month of serverless execution and 100GB bandwidth on the Hobby plan.

### Step 1: Import Repository to Vercel
1. Log in to [vercel.com](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Import your `CourseFlow` repository.

### Step 2: Configure Project Settings
- **Framework Preset:** Other
- **Root Directory:** `./` (or `backend` if you want a dedicated backend project).
- CourseFlow includes root and backend `vercel.json` and `api/index.py` files to support either configuration automatically.

### Step 3: Add Environment Variables
In the **Environment Variables** section, configure:

| Variable | Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://neondb_owner:...-pooler...neon.tech/neondb?sslmode=require` | Your Neon pooled connection string. |
| `ENVIRONMENT` | `production` | Enables `NullPool` serverless connection mode. |
| `SECRET_KEY` | *(Generate a 32+ character random secret)* | Signs faculty JWTs. The built-in default is refused in production, staging and on Vercel, so faculty login fails until this is set. |
| `ADMIN_USERNAME` | `admin` (or your choice) | Username of the administrator account. |
| `ADMIN_PASSWORD_HASH` | *(bcrypt hash)* | Generate locally with `python backend/scripts/hash_password.py` and paste the hash as-is. There are no default credentials; leaving this empty disables the account. |
| `REVIEWER_USERNAME` / `REVIEWER_PASSWORD_HASH` | *(optional)* | Faculty reviewer account (can upload, review and commit extractions, but cannot edit courses). |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` (default) | Lifetime of faculty access tokens. |
| `OLLAMA_BASE_URL` | *(blank on Vercel)* | Local language model for MIS extraction (CF-232). Vercel cannot host Ollama, so leave it blank there: uploads end `FAILED` with a clear message and everything else works. |
| `OLLAMA_MODEL` | `qwen2.5:7b-instruct` (default) | Model that must be pulled in that Ollama. |
| `CORS_ORIGINS` | `https://*.pages.dev,http://localhost:5173` | Allowed CORS origins (Cloudflare Pages domains are also allowed via regex). |

### Step 4: Deploy and Verify
1. Click **Deploy**.
2. Once the build finishes, copy your assigned deployment domain (e.g. `https://courseflow-api.vercel.app`).
3. Test your live endpoints in your browser or terminal:
   ```bash
   curl https://your-backend.vercel.app/api/health
   # Response: {"status":"healthy","service":"CourseFlow API","version":"1.0.0"}

   curl https://your-backend.vercel.app/api/programs
   # Returns list of available engineering degree summaries
   ```

---

## 3. Frontend: Cloudflare Pages (Free Tier)

Cloudflare Pages provides unlimited bandwidth, 500 builds/month, and free SSL on `*.pages.dev`.

### Step 1: Connect Repository to Cloudflare Pages
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com) and navigate to **Workers & Pages** -> **Create Application** -> **Pages** -> **Connect to Git**.
2. Select your `CourseFlow` GitHub repository.

### Step 2: Configure Build Settings
In the **Set up builds and deployments** screen:
- **Project Name:** `courseflow` (or chosen subdomain)
- **Production Branch:** `dev` or `main`
- **Framework Preset:** `Vite`
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Build Output Directory:** `dist`

*(Alternative if Root Directory is left as `.`: Build Command: `npm run build`, Output Directory: `frontend/dist`)*

### Step 3: Add Environment Variables
Under **Environment Variables (Advanced)**, add:

| Variable | Value |
| :--- | :--- |
| `VITE_API_BASE_URL` | `https://your-backend.vercel.app` (Your Vercel production backend URL) |
| `NODE_VERSION` | `20` |

### Step 4: Deploy
1. Click **Save and Deploy**.
2. Cloudflare will run `npm ci` and `npm run build`.
3. The Single Page Application fallback routing (`_redirects`) and security headers (`_headers`) in `frontend/public/` are automatically bundled to `dist/`, ensuring zero 404s on browser reloads.
4. Your site will be live at `https://<your-project>.pages.dev`!

---

## 4. Verification & Operational Testing

Once both services are deployed:
1. Open `https://<your-project>.pages.dev`.
2. Verify that the constellation canvas renders with Skyrim skill tree aesthetics and 8-semester swimlane headers.
3. Test vertical scrolling: confirm that the canvas stops cleanly above Semester 1 and below Semester 8 without drifting into the void.
4. Toggle between Computer Engineering and Electrical Engineering to verify theme switching (`data-department="ce"` frost blue / `data-department="ee"` dwemer amber).
5. Open a course module drawer: verify syllabus objectives, contact hours, and prerequisite dependencies.
6. Click **PDF Export**: confirm that client-side rendering compiles your academic plan cleanly.
7. Faculty API check: `POST /api/v1/auth/login` with the admin credentials returns an `accessToken`; `GET /api/v1/auth/me` with `Authorization: Bearer <token>` returns the admin identity; the same call without a token returns 401. `GET /api/programs` must still work with no token.
8. Course edits are saved to PostgreSQL, but the student canvas currently loads the bundled catalog files, so edits do not appear for students until the read path moves to the database (see `plans/Didula_Sprint2.md` section 6).

---

## 5. Ongoing Maintenance & Secrets Rotation

- **Rotating `SECRET_KEY`** immediately signs out every faculty session (tokens signed with the old key stop verifying). **Changing a password** means generating a new hash, updating `ADMIN_PASSWORD_HASH` and redeploying; existing tokens stay valid until they expire (60 minutes) unless the key is also rotated.

- **Zero Cost Guarantee:** As long as database usage remains under 0.5 GiB and backend executions stay within 100k invocations/day, all services operate permanently within free allowances.
- **Database Cold Starts:** Neon automatically suspends idle compute after 5 minutes of inactivity. When a student visits after an idle period, the first API request might experience a brief ~1-2s cold-start while compute resumes. CourseFlow's `pool_pre_ping=True` and guest-mode local catalog ensure students can continue interacting with the canvas seamlessly even during cold starts.
