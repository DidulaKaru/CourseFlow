# Sprint 1 Implementation Plan: Ishani (QA & DevOps)

**Role:** QA Lead & DevOps Engineer  
**Sprint Focus:** Containerization, CI/CD Pipeline, Vitest & Pytest Automated Test Harness, Quality Gates  
**Target Milestone:** Sprint 1 Delivery (Zero-Login Student Web App for 2 Degree Programs)

---

## 1. Responsibilities & Domain Ownership
Ishani ensures software reliability, repeatable development environments, and automated quality verification. In Sprint 1, responsibilities encompass:
- Creating and maintaining `docker-compose.yml` for unified local development (FastAPI backend, PostgreSQL with `pgvector`, and Ollama runtime).
- Implementing `.env.example` and environment configuration templates.
- Upgrading GitHub Actions (`.github/workflows/ci.yml`) to enforce automated type checks, linters, and test execution for both frontend and backend.
- Managing pre-commit hooks (Husky + lint-staged) and Git protection rules.
- Establishing the frontend testing harness with Vitest (testing store state, credit calculators, layout logic).
- Developing the backend test suite with Pytest (testing FastAPI endpoints, AST evaluations, schema validations).
- Monitoring test coverage and setting quality benchmarks.

---

## 2. Phase-by-Phase Execution Roadmap

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Docker Containerization & Local Dev Environment Setup         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 2: Environment Variables & Pre-commit Quality Gates (Husky)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 3: Frontend Automated Testing Suite (Vitest)                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 4: Backend Automated Testing Suite (Pytest)                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 5: CI/CD Pipeline Automation (GitHub Actions)                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Phase 6: Test Coverage Benchmarks & Sprint 1 QA Sign-off               │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Docker Containerization & Local Dev Environment Setup
* **Goal:** Standardize the local development stack across the team with one-command startup.
* **Target Files:**
  - `docker-compose.yml`
  - `backend/Dockerfile`
* **Services to Configure:**
  1. `db`:
     - Image: `pgvector/pgvector:pg16`
     - Environment: `POSTGRES_USER=courseflow`, `POSTGRES_PASSWORD=courseflow_secret`, `POSTGRES_DB=courseflow_db`
     - Ports: `5432:5432`
     - Health check: `pg_isready -U courseflow -d courseflow_db`
     - Volume: `pgdata:/var/lib/postgresql/data`
  2. `backend`:
     - Dockerfile build in `./backend` (Python 3.11/3.12 slim, Uvicorn server).
     - Ports: `8000:8000`
     - Depends on: `db` (healthy)
     - Volume bind mount for live code reload.
  3. `ollama` (Placeholder for Sprint 2/4):
     - Image: `ollama/ollama:latest`
     - Ports: `11434:11434`
     - Volume: `ollama_data:/root/.ollama`
* **Verification:** `docker compose up -d` boots all containers with green health status.

---

### Phase 2: Environment Variables & Pre-commit Quality Gates (Husky)
* **Goal:** Prevent accidental credential leaks and enforce local pre-commit verification.
* **Target Files:**
  - `.env.example`
  - `.husky/pre-commit`
  - `package.json` (`lint-staged`)
* **Tasks:**
  1. Provide `.env.example` documenting all necessary environment flags:
     - `DATABASE_URL=postgresql://courseflow:courseflow_secret@localhost:5432/courseflow_db`
     - `BACKEND_PORT=8000`
     - `FRONTEND_URL=http://localhost:5173`
  2. Configure Husky pre-commit hook:
     - Run `lint-staged` (formatting and linting staged files).
     - Run `npx tsc --noEmit` to intercept TypeScript compilation errors prior to commit.
* **Verification:** Intentionally introducing a type error or bad syntax halts `git commit`.

---

### Phase 3: Frontend Automated Testing Suite (Vitest)
* **Goal:** Build robust unit tests for client-side state, layout mathematics, and credit calculation.
* **Target Files:**
  - `vite.config.ts` (or `vitest.config.ts`)
  - `src/core/__tests__/store.test.ts`
  - `src/core/__tests__/layout.test.ts`
  - `src/core/__tests__/ast_evaluator.test.ts`
* **Test Cases:**
  1. **Zustand Store Tests:**
     - Toggling an elective adds/removes its ID from `selectedElectiveIds`.
     - Toggling completed course updates `completedCourseIds`.
     - `resetPlanner()` purges student selections while keeping active program.
  2. **Layout Mathematics Tests:**
     - Verifies $X$-coordinate adheres to $\text{semesterIndex} \times 280\text{px}$.
     - Confirms zero overlapping nodes within the same semester slot.
  3. **AST Evaluator Tests:**
     - Evaluates single course completion, nested `AND` branches, `OR` branches, and `CREDIT_THRESHOLD`.
* **Verification:** `npm test` runs with 100% passing assertions.

---

### Phase 4: Backend Automated Testing Suite (Pytest)
* **Goal:** Verify FastAPI endpoint reliability, CORS headers, and error response contracts.
* **Target Files:**
  - `backend/tests/conftest.py`
  - `backend/tests/test_main.py`
  - `backend/tests/test_degrees.py`
* **Test Cases:**
  1. **Health Check:** `GET /health` returns status `healthy` and timestamp.
  2. **Degrees Endpoint:** `GET /api/v1/degrees` returns JSON array with valid status code 200.
  3. **CORS Validation:** Verifies pre-flight `OPTIONS` requests from `http://localhost:5173` receive permitted CORS headers.
  4. **Pydantic Validation:** Passing invalid body schemas to `/api/v1/validate-plan` returns HTTP 422 Unprocessable Entity.
* **Verification:** `pytest backend/tests` executes with 0 failures.

---

### Phase 5: CI/CD Pipeline Automation (GitHub Actions)
* **Goal:** Automate end-to-end quality checks on every pull request targeting `main` and `dev`.
* **Target Files:**
  - `.github/workflows/ci.yml`
* **Pipeline Jobs:**
  1. **Frontend Gate:**
     - Checkout repository.
     - Setup Node.js 20 with npm cache.
     - `npm ci`
     - `npx tsc --noEmit`
     - `npm run lint`
     - `npm test`
     - `npm run build`
  2. **Backend Gate:**
     - Setup Python 3.11/3.12 with pip cache.
     - Install requirements (`backend/requirements.txt`).
     - Run linter/type check (`ruff check backend/`).
     - Run `pytest backend/tests`.
* **Verification:** GitHub Actions runs successfully and blocks PR merges if any job fails.

---

### Phase 6: Test Coverage Benchmarks & Sprint 1 QA Sign-off
* **Goal:** Establish test coverage reporting and certify release readiness for Sprint 1.
* **Tasks:**
  1. Configure coverage reporting for Vitest (`v8` provider) and Pytest (`pytest-cov`).
  2. Establish a minimum code coverage threshold of $\ge 80\%$ for core mathematical and validation modules.
  3. Deliver a Sprint 1 QA Test Summary Report verifying that the two degree programs compile and render without errors.
* **Verification:** QA sign-off document published to repository with green build metrics.

---

## 3. Definition of Done (DoD) for Sprint 1
- [ ] `docker-compose.yml` launches PostgreSQL (with pgvector) and backend services reliably.
- [ ] `.env.example` provides clear documentation for all local developer flags.
- [ ] Pre-commit hooks via Husky block commits with linting or TypeScript type errors.
- [ ] Vitest test suite covers Zustand store, layout calculations, and AST evaluation with 100% pass rate.
- [ ] Pytest test suite validates FastAPI health, degree query endpoints, and schema errors.
- [ ] GitHub Actions workflow passes green on both frontend and backend validation jobs.
- [ ] Test coverage exceeds $80\%$ across all algorithmic and state modules.
