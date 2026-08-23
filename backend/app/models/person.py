from ..extensions import db
from .user import utcnow


class Person(db.Model):
    """Someone I have lent money to.

    Note what is NOT here: there is no `balance` column. The balance is derived
    from the transaction rows every time it is needed. A stored balance is a
    cache, and a cache that can disagree with the transactions is a bug waiting
    to happen.
    """

    __tablename__ = "people"

    id = db.Column(db.Integer, primary_key=True)

    # ondelete="CASCADE": if a user row is ever deleted, their people go too.
    # Orphaned rows pointing at a missing user would be unreachable garbage.
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(32), nullable=True)
    notes = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    user = db.relationship("User", back_populates="people")

    # passive_deletes=True tells SQLAlchemy not to try to delete children
    # itself - the database RESTRICT rule on transactions.person_id is what
    # actually protects financial history.
    transactions = db.relationship(
        "Transaction",
        back_populates="person",
        lazy="dynamic",
        passive_deletes=True,
    )

    __table_args__ = (
        # Supports both "list my people alphabetically" and name search.
        db.Index("ix_people_user_name", "user_id", "name"),
        # A *partial* unique index: two people cannot share a phone number, but
        # any number of people may have no phone at all. A plain UNIQUE would
        # (on some databases) reject the second NULL.
        db.Index(
            "uq_people_user_phone",
            "user_id",
            "phone",
            unique=True,
            postgresql_where=db.text("phone IS NOT NULL"),
            sqlite_where=db.text("phone IS NOT NULL"),
        ),
        db.CheckConstraint("length(trim(name)) > 0", name="ck_people_name_not_blank"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "phone": self.phone,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f"<Person {self.name}>"
