# How Elastic Beanstalk starts the application.
#
# Without this file EB guesses: it looks for an object called `application` in a
# file called `application.py`. Ours is called `app` and lives in backend/run.py,
# so we tell it exactly what to run.
#
# Reading the command left to right:
#
#   gunicorn        the production WSGI server. Flask's own server handles one
#                   request at a time and prints tracebacks to the browser;
#                   Gunicorn runs several worker processes and does neither.
#
#   --chdir backend changes into backend/ before importing, and puts it on the
#                   import path. That is what makes `run:app` resolvable while
#                   the application root stays at the repository root.
#
#   --bind :8000    the port EB's nginx forwards to. EB expects 8000.
#
#   --workers 3     three worker processes. A rough rule is (2 x CPUs) + 1;
#                   a t3.micro has 2 vCPUs but only 1 GB of RAM, and each worker
#                   carries its own SQLAlchemy connection pool, so 3 is a saner
#                   fit than 5.
#
#   --timeout 60    kill a worker that has been stuck on one request for a
#                   minute. Protects against one slow query taking the site down.
#
#   run:app         the module `run` (backend/run.py) and the object `app`
#                   inside it - the Flask application create_app() returned.

web: gunicorn --chdir backend --bind :8000 --workers 3 --timeout 60 --access-logfile - --error-logfile - run:app
