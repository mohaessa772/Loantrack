"""Business rules for people.

Route functions call into here. They never touch the ORM directly, which keeps
"what the rules are" separate from "what HTTP status to return".
"""

from ..errors import ConflictError, NotFoundError
from ..extensions import db
from ..models import Person, Transaction


def get_owned_person(user_id, person_id) -> Person:
    """Fetch a person, or raise 404.

    Note the user_id filter. If someone asks for a person that belongs to
    another account we return 404, not 403 - telling them "that exists but is
    not yours" would leak which IDs are real.
    """
    person = Person.query.filter_by(id=person_id, user_id=user_id).first()
    if person is None:
        raise NotFoundError("That person does not exist.")
    return person


def _phone_taken(user_id, phone, exclude_id=None) -> bool:
    if not phone:
        return False
    query = Person.query.filter_by(user_id=user_id, phone=phone)
    if exclude_id is not None:
        query = query.filter(Person.id != exclude_id)
    return db.session.query(query.exists()).scalar()


def create_person(user_id, name, phone=None, notes=None) -> Person:
    if _phone_taken(user_id, phone):
        raise ConflictError(
            "Another person already has that phone number.",
            fields={"phone": "Already used by someone else."},
        )
    person = Person(user_id=user_id, name=name, phone=phone, notes=notes)
    db.session.add(person)
    db.session.commit()
    return person


def update_person(user_id, person_id, name, phone=None, notes=None) -> Person:
    person = get_owned_person(user_id, person_id)
    if _phone_taken(user_id, phone, exclude_id=person.id):
        raise ConflictError(
            "Another person already has that phone number.",
            fields={"phone": "Already used by someone else."},
        )
    person.name = name
    person.phone = phone
    person.notes = notes
    db.session.commit()
    return person


def delete_person(user_id, person_id) -> None:
    """Delete a person only when it is safe.

    "Safe" means: no transactions, not even soft-deleted ones. Cascading a
    delete through someone's financial history because of a mis-click is not
    something this app will ever do. 409 CONFLICT is the right status: the
    request is perfectly valid, it just clashes with the current state.
    """
    person = get_owned_person(user_id, person_id)

    count = Transaction.query.filter_by(person_id=person.id).count()
    if count:
        raise ConflictError(
            f"{person.name} has {count} transaction(s). "
            "Delete those transactions first if you really want to remove this person."
        )

    db.session.delete(person)
    db.session.commit()
