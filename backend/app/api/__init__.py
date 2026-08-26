"""API blueprints.

Every route lives under /api/... so the URL space never collides with the
frontend's own routes (/people, /dashboard) once both are served together.
"""

from .auth import auth_bp
from .backup import backup_bp
from .dashboard import dashboard_bp
from .people import people_bp
from .settings import settings_bp
from .transactions import transactions_bp

ALL_BLUEPRINTS = (
    auth_bp,
    people_bp,
    transactions_bp,
    dashboard_bp,
    settings_bp,
    backup_bp,
)
