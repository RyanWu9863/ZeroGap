"""決策紀錄寫進資料庫：decision_records

每一題的決策紀錄（app.decision_trace.DecisionRecord）原本只寫在 worker 日誌；
這張表讓 planner 在規劃結束時另外存一份，用 job_id 查同一次規劃的每一題。
只有選項代碼、機率、狀態和時間，沒有使用者偏好、選項名稱、prompt。

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "decision_records",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column("job_id", sa.Text, nullable=False),
        sa.Column("question_id", sa.Text, nullable=False),
        sa.Column("k", sa.SmallInteger, nullable=False),
        sa.Column("policy", sa.Text, nullable=False),
        sa.Column("p_top", sa.Double),
        sa.Column("margin", sa.Double),
        sa.Column("norm_entropy", sa.Double),
        sa.Column("unsure", sa.Boolean, nullable=False),
        sa.Column("jev_top", sa.Text),
        sa.Column("jev_model", sa.Text),
        sa.Column("jev_latency_ms", sa.Double),
        sa.Column("jev_attempts", sa.SmallInteger),
        sa.Column("llm_status", sa.Text),
        sa.Column("llm_latency_ms", sa.Double),
        sa.Column("llm_model", sa.Text),
        sa.Column("chosen", sa.Text),
        sa.Column("decided_by", sa.Text, nullable=False),
        sa.Column("fallback_reason", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.CheckConstraint("decided_by IN ('jev', 'llm', 'fallback')",
                           name="ck_decision_records_decided_by"),
    )  # fmt: skip
    op.create_index("ix_decision_records_job_id", "decision_records", ["job_id"])
    op.create_index("ix_decision_records_created_at", "decision_records", ["created_at"])


def downgrade() -> None:
    op.drop_table("decision_records")  # 索引和檢查條件跟著刪
