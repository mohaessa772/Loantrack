"""Flask extensions are created here, unbound to any app.

They are attached to the application inside create_app(). Keeping them in their
own module is what breaks the circular import problem: models can import `db`
without importing the application, and the application can import the models.
"""

from flask_cors import CORS
from flask_login import LoginManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from flask_wtf.csrf import CSRFProtect

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
csrf = CSRFProtect()
cors = CORS()
