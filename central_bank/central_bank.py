"""A central bank for managing scheduling resources"""

import json
from contextlib import contextmanager
from abc import abstractmethod, ABCMeta

from bottle import default_app, route, get, post, run, request, debug, HTTPResponse
from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from jsonschema import validate, ValidationError

debug(True)

Base = declarative_base()


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True)
    balence = Column(Integer, nullable=False)


class Record(Base):
    __tablename__ = "records"

    id = Column(Integer, primary_key=True)
    from_id = Column(Integer, nullable=False)
    to_id = Column(Integer, nullable=False)
    amount = Column(Integer, nullable=False)


def error_if_none(value, error_mes):
    if not value:
        raise Exception(error_mes)

    return value


class BankError(Exception):
    __metaclass__ = ABCMeta

    def get_error_object(self):
        return {
            "status": "InvalidAccountUUID",
            "error_message": self.args[0]
        }


class InsufficientFunds(BankError):
    def get_error_object(self):
        return {
            "status": "InsufficientFunds",
            "error_message": "Insufficient Funds"
        }


class InvalidAccountUUID(BankError):
    def __init__(self, invalid_uuid):
        self.invalid_uuid = invalid_uuid
        super().__init__(f"{invalid_uuid} is not a valid accout UUID")

    def get_error_object(self):
        return {
            "status": "InvalidAccountUUID",
            "error_message": self.args[0]
        }


class Bank:
    def __init__(self):
        self.engine = create_engine("sqlite:///sqlalchemy_example.db")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker()
        self.Session.configure(bind=self.engine)

    @contextmanager
    def session_scope(self):
        """Provide a transactional scope around a series of operations."""
        session = self.Session()
        try:
            yield session
            session.commit()
        except:
            session.rollback()
            raise
        finally:
            session.close()

    def _alter_account(self, account_id, amount, session):
        account = session.query(Account).filter_by(id=account_id).first() # type: Account
        error_mes = f"Account '{account_id}' doesn't exist"

        if account.balence + amount < 0:
            raise InsufficientFunds()

        account.balence += amount

    def transfer(self, from_account, to_account, amount):
        with self.session_scope() as session:
            self._alter_account(from_account, -amount, session)
            self._alter_account(to_account, amount, session)

            record = Record(from_account, to_account, amount)
            session.add(record)

        return id

    def get_transaction(self, record_id):
        with self.session_scope() as session:
            record = session.query(Record).filter_by(record_id).first()

        if not record:
            raise InvalidAccountUUID(id)

        return {
            "from": record["FromId"],
            "to": record["ToId"],
            "amount": record["Amount"]
        }


bank = Bank()

transfer_schema = {
    "type": "object",
    "properties": {
        "from": {"type": "number"},
        "to": {"type": "number"},
        "amount": {"type": "number"}
    }
}


@get("/transaction/<id>")
def get_transaction(id):
    return {
        "status": "ok",
        "response": bank.get_transaction(id)
    }


@post("/transfer")
def transfer():
    try:
        req = json.loads(request.body())
        validate(req, transfer_schema)
        id = bank.transfer(
            req["from"],
            req["to"],
            req["amount"]
        )
    except InsufficientFunds:
        resp = {
            "status": "request_denied",
            "error_message": "Insufficient Funds"
        }
        return HTTPResponse(status=403, body=json.dumps(resp))

    resp = {
        "status": "ok",
        "transaction_uuid": str(id)
    }

    return json.dumps(resp)


application = default_app()
