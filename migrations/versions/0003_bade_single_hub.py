"""八德只用一個代表點：廣豐新天地（2026-10-21 使用者決定「大湳為廣豐新天地」）

原本八德有大湳、廣豐新天地兩個代表點；使用者說明大湳指的就是廣豐新天地
（334 桃園市八德區介壽路一段 728 號），所以拿掉「大湳」。

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.get_bind().execute(
        sa.text(
            "DELETE FROM area_hubs WHERE name = '大湳' "
            "AND area_id = (SELECT id FROM areas WHERE code = 'bade')"
        )
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text(
            "INSERT INTO area_hubs (area_id, name) SELECT id, '大湳' FROM areas WHERE code = 'bade'"
        )
    )
