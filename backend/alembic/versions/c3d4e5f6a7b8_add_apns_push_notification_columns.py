"""add_apns_push_notification_columns

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # APNs device token — used to send push notifications
    op.add_column(
        'users',
        sa.Column('apns_device_token', sa.String(255), nullable=True),
    )
    # Push-notification opt-in (default True — users can disable in Settings)
    op.add_column(
        'users',
        sa.Column(
            'push_notifications_enabled',
            sa.Boolean(),
            server_default=sa.text('true'),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'push_notifications_enabled')
    op.drop_column('users', 'apns_device_token')
