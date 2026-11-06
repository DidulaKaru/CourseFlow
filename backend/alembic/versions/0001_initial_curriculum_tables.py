"""0001 initial curriculum tables

Revision ID: 0001_initial_curriculum_tables
Revises:
Create Date: 2026-11-04 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial_curriculum_tables"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Enable pgvector extension if PostgreSQL dialect is active and available
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        has_vector = bind.execute(sa.text("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'")).scalar()
        if has_vector:
            op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # Compat JSON type for dialects
    json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

    # 2. degree_programs table
    op.create_table(
        "degree_programs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("department", sa.String(), nullable=False),
        sa.Column("total_credits_required", sa.Integer(), nullable=False, server_default="150"),
        sa.Column("min_credits_per_semester", sa.Integer(), nullable=False, server_default="18"),
        sa.Column("max_credits_per_semester", sa.Integer(), nullable=False, server_default="24"),
        sa.Column("semesters_count", sa.Integer(), nullable=False, server_default="8"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_degree_programs_id", "degree_programs", ["id"])

    # 3. courses table
    op.create_table(
        "courses",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("total_credits", sa.Integer(), nullable=False),
        sa.Column("duration_semesters", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("recommended_semester", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("prerequisite_rule", json_type, nullable=True),
        sa.Column("corequisites", json_type, nullable=False, server_default="[]"),
        sa.Column("offered_semesters", json_type, nullable=False, server_default="[]"),
        sa.Column("syllabus_objectives", json_type, nullable=True, server_default="[]"),
        sa.Column("contact_hours", json_type, nullable=True, server_default="{}"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_courses_id", "courses", ["id"])
    op.create_index("ix_courses_code", "courses", ["code"])
    op.create_index("ix_courses_recommended_semester", "courses", ["recommended_semester"])

    # 4. program_courses association table
    op.create_table(
        "program_courses",
        sa.Column("program_id", sa.String(), nullable=False),
        sa.Column("course_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["program_id"], ["degree_programs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("program_id", "course_id"),
    )

    # 5. credit_distributions table
    op.create_table(
        "credit_distributions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("course_id", sa.String(), nullable=False),
        sa.Column("semester_index", sa.Integer(), nullable=False),
        sa.Column("credits_allocated", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_credit_distributions_course_id", "credit_distributions", ["course_id"])

    # 6. prerequisite_rules table
    op.create_table(
        "prerequisite_rules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("course_id", sa.String(), nullable=False),
        sa.Column("rule_type", sa.String(), nullable=False),
        sa.Column("expression", json_type, nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("course_id"),
    )
    op.create_index("ix_prerequisite_rules_course_id", "prerequisite_rules", ["course_id"])


def downgrade() -> None:
    op.drop_table("prerequisite_rules")
    op.drop_table("credit_distributions")
    op.drop_table("program_courses")
    op.drop_table("courses")
    op.drop_table("degree_programs")
