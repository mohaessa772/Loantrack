"""Development entry point.

    python run.py                      -> start the dev server on :5000
    flask --app run.py init-db         -> create tables
    flask --app run.py create-user     -> create your login
    flask --app run.py seed-demo       -> add sample data
"""

from dotenv import load_dotenv

# Load backend/.env BEFORE importing anything that reads os.environ.
load_dotenv()

from app import create_app  # noqa: E402

app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
