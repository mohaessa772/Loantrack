"""Backup routes: /api/backup

The whole account in one file, and the way back from it.
"""

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..services import backup_service
from ..validators import clean_str, get_json

backup_bp = Blueprint("backup", __name__, url_prefix="/api/backup")


@backup_bp.get("")
@login_required
def download_backup():
    """Everything this account owns, as JSON.

    Deliberately not a file download from the server: the frontend turns this
    into a file, which keeps the endpoint a plain readable API call you can also
    hit from Postman or curl.
    """
    return jsonify(backup_service.export_data(current_user)), 200


@backup_bp.post("/restore")
@login_required
def restore_backup():
    """Replace this account's records with the contents of a backup file.

    Body: {"data": <the parsed backup>, "mode": "merge" | "replace"}

    Without mode="replace", an account that already holds records is refused
    with 409 rather than being quietly overwritten.
    """
    body = get_json(request)
    mode = (clean_str(body.get("mode")) or "merge").lower()
    result = backup_service.import_data(current_user, body.get("data"), mode=mode)
    return jsonify({"restored": result}), 200
