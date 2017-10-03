"""A central bank for managing scheduling resources"""

import json
from contextlib import contextmanager
from abc import abstractmethod, ABCMeta

from flask import Flask, request, jsonify
from sqlalchemy import Column, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from jsonschema import validate
import argparse

app = Flask(__name__)
Base = declarative_base()


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True)
    balance = Column(Integer, nullable=False)

    def __init__(self, balance):
        self.balance = balance


class Record(Base):
    __tablename__ = "records"

    id = Column(Integer, primary_key=True)
    from_id = Column(Integer, nullable=False)
    to_id = Column(Integer, nullable=False)
    amount = Column(Integer, nullable=False)

    def __init__(self, from_id, to_id, amount):
        self.from_id = from_id
        self.to_id = to_id
        self.amount = amount


def error_if_none(value, error_mes):
    if not value:
        raise Exception(error_mes)

    return value


class BankError(Exception):
    __metaclass__ = ABCMeta

    @abstractmethod
    def get_response(self):
        pass


class InsufficientFunds(BankError):
    def get_response(self):
        return app.response_class(
            response=json.dumps({
                "status": "request_denied",
                "error_message": "Insufficient Funds"
            }),
            status=403,
            mimetype='application/json'
        )


class InvalidAccountUUID(BankError):
    def __init__(self, invalid_uuid):
        self.invalid_uuid = invalid_uuid
        super().__init__(f"{invalid_uuid} is not a valid account UID")

    def get_response(self):
        return app.response_class(
            response=json.dumps({
                "status": "invalid_request",
                "error_message": f"Invalid UID: {str(self)}"
            }),
            status=400,
            mimetype='application/json'
        )


class Bank:
    def __init__(self):
        self.engine = create_engine("sqlite:///central_bank.db")
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

        if account.balance + amount < 0:
            raise InsufficientFunds()

        account.balance += amount

    def transfer(self, from_account, to_account, amount):
        with self.session_scope() as session:
            self._alter_account(from_account, -amount, session)
            self._alter_account(to_account, amount, session)

            record = Record(from_account, to_account, amount)
            session.add(record)
            session.flush()
            return id

    def create_new_account(self):
        with self.session_scope() as session:
            new_account = Account(1000000) # for testing
            session.add(new_account)
            session.flush()
            return new_account.id

    def get_transaction(self, record_id):
        with self.session_scope() as session:
            record = session.query(Record).filter_by(id=record_id).first()

        if not record:
            raise InvalidAccountUUID(record_id)

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


@app.route("/transaction/<record_id>")
def get_transaction(record_id):
    try:
        return jsonify({
            "status": "ok",
            "response": bank.get_transaction(record_id)
        })
    except BankError as e:
        return e.get_response()


@app.route("/transfer", methods=["POST"])
def transfer():
    try:
        req = request.get_json()
        validate(req, transfer_schema)
        req_id = bank.transfer(
            req["from"],
            req["to"],
            req["amount"]
        )
    except BankError as e:
        return e.get_response()

    return jsonify({
        "status": "ok",
        "transaction_uuid": str(req_id)
    })


@app.route("/new-account", methods=["POST"])
def create_new_account():
    try:
        req = request.get_json()
        account_id = bank.create_new_account()
    except BankError as e:
        return e.get_response()

    return jsonify({
        "status": "ok",
        "account_id": account_id
    })


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Central bank for a computational scheduling service")
    parser.add_argument("--debug", help="Launch in debug mode", action="store_true")
    parser.add_argument("--port", help="Port to use", type=int, default=8080)
    parser.add_argument("--host", help="Address to use", default="127.0.0.1")

    options = parser.parse_args()
    app.run(host=options.host, port=options.port, use_reloader=options.debug)
