"""0002 add courses.updated_at

Revision ID: 0002_course_updated_at
Revises: 0001_initial_curriculum_tables
Create Date: 2026-11-21 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_course_updated_at"
down_revision: str | None = "0001_initial_curriculum_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # batch mode: SQLite cannot ADD COLUMN with a non-constant default; PostgreSQL emits a plain ALTER.
    with op.batch_alter_table("courses") as batch_op:
        batch_op.add_column(
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("courses") as batch_op:
        batch_op.drop_column("updated_at")
