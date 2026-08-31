"""Application entry point.

Two very different things import this file:

  Locally   `python run.py` runs the block at the bottom and starts Flask's own
            development server.

  Production
            Gunicorn imports this module and uses the `app` object directly.
            The __main__ block never runs, so the development server is not
            merely disabled in production - it is never reached.

    python run.py                      -> dev server on :5000
    flask --app run.py init-db         -> create/upgrade the schema
    flask --app run.py create-user     -> create a login
    flask --app run.py seed-demo       -> add sample data
"""

import os

from dotenv import load_dotenv

# Load backend/.env BEFORE importing anything that reads os.environ.
# On the server there is no .env file - Elastic Beanstalk injects the real
# environment variables - and load_dotenv() simply finds nothing and moves on.
load_dotenv()

from app import create_app  # noqa: E402
from app.config import Config, ProductionConfig  # noqa: E402

# FLASK_ENV picks the configuration. Anything other than "production" is treated
# as development, so a typo fails safe: you get the development server rather
# than an unprotected production one.
app = create_app(ProductionConfig if Config.ENV == "production" else Config)

if __name__ == "__main__":
    # The Werkzeug debugger can execute arbitrary code through the browser. It
    # is a superb development tool and an catastrophic thing to expose, so it is
    # tied to the environment rather than hard-coded on.
    #
    # FLASK_DEBUG=0 turns it off locally too, which is how you test a
    # production-like run on your own machine.
    is_production = Config.ENV == "production"
    debug = os.environ.get("FLASK_DEBUG", "0" if is_production else "1") == "1"

    if is_production and debug:
        raise RuntimeError(
            "Refusing to start the development server with debug enabled while "
            "FLASK_ENV=production. Use Gunicorn in production."
        )

    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "5000")), debug=debug)
