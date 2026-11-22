"""0003 add extraction_jobs table

Revision ID: 0003_extraction_jobs_table
Revises: 0002_course_updated_at
Create Date: 2026-11-22 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_extraction_jobs_table"
down_revision: str | None = "0002_course_updated_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

    op.create_table(
        "extraction_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("extracted_data", json_type, nullable=True),
        sa.Column("confidence_scores", json_type, nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("committed_course_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["committed_course_id"], ["courses.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_extraction_jobs_file_hash", "extraction_jobs", ["file_hash"], unique=True)
    op.create_index("ix_extraction_jobs_status", "extraction_jobs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_extraction_jobs_status", table_name="extraction_jobs")
    op.drop_index("ix_extraction_jobs_file_hash", table_name="extraction_jobs")
    op.drop_table("extraction_jobs")
