# ADR-001: Zero-Login Student Architecture & Local-First State

## Context
Students use degree planning software intermittently (1–2 times per semester). Implementing a full user authentication service (auth tables, passwords, email verification, JWT sessions) introduces high development overhead, database maintenance, and high user friction.

## Decision
CourseFlow will operate in a zero-login Guest Mode for students. All degree planning, elective selections, and completed module states will persist directly in client-side `localStorage` via Zustand middleware. State portability will be handled via JSON import/export.

## Consequences
- **Positive:** Zero friction for students; eliminates user management tables and authentication vulnerabilities; enables rapid Sprint 1 completion.
- **Negative:** Students cannot automatically sync plans across multiple devices without exporting/importing their plan JSON.