"""新增「蘆竹（南崁）」商圈，青埔先不開放（2026-10-20 決定）

開眼電影網的「桃園中壢」區沒有青埔的影城；台茂購物中心的影城在蘆竹南崁。
代表點是台茂購物中心，座標由 TDX 地理編碼補上。

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE areas SET is_open = false WHERE code = 'qingpu'"))
    conn.execute(
        sa.text(
            "INSERT INTO areas (county_id, code, name, is_open, sort_order) "
            "SELECT id, 'luzhu', '蘆竹（南崁）', true, 4 FROM counties WHERE code = 'Taoyuan'"
        )
    )
    conn.execute(
        sa.text(
            "INSERT INTO area_hubs (area_id, name) SELECT id, '台茂購物中心' FROM areas "
            "WHERE code = 'luzhu'"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM area_hubs WHERE area_id = (SELECT id FROM areas WHERE code = 'luzhu')")
    )
    conn.execute(sa.text("DELETE FROM areas WHERE code = 'luzhu'"))
    conn.execute(sa.text("UPDATE areas SET is_open = true WHERE code = 'qingpu'"))
