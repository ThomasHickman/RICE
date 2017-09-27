import sqlite3
import requests
import json
import asyncio
from bottle import default_app, route, get, post, run, request, debug
import os
from jsonschema import validate, ValidationError

debug(True)

database_path = "database.db"


def error_if_none(value, error_mes):
    if not value:
        raise Exception(error_mes)

    return value


class InsufficientFunds(Exception):
    pass


class Bank:
    def __init__(self):
        if not os.path.exists(database_path):
            self.conn = self.create_database()
        else:
            self.conn = sqlite3.connect(database_path)

    def create_database(self):
        with open("create_database.sql", "r") as sql_file:
            init_db_code = sql_file.read()

        conn = sqlite3.connect(database_path)
        cursor = self.conn.cursor()
        cursor.execute(init_db_code)
        cursor.close()

        return conn

    def alter_account(self, account_id, amount, cursor=None):
        if not cursor:
            created_cursor = True
            cursor = self.conn.cursor()
        else:
            created_cursor = False

        cursor.execute("SELECT Balance FROM accounts WHERE Id=?", account_id)
        from_balance = error_if_none(cursor.fetchone(), f"Account '${account_id}' doesn't exist")[0]

        if from_balance + amount < 0:
            raise InsufficientFunds()

        cursor.execute("UPDATE accounts SET Balance=? WHERE Id=?", (from_balance + amount, account_id))

        if created_cursor:
            cursor.close()

    def transfer(self, from_account, to_account, amount):
        cursor = self.conn.cursor()

        self.alter_account(from_account, -amount, cursor=cursor)
        self.alter_account(to_account, amount, cursor=cursor)

        cursor.close()


bank = Bank()

transfer_schema = {
    "type": "object",
    "properties": {
        "from": {"type": "number"},
        "to": {"type": "number"},
        "amount": {"type": "number"}
    }
}


@post("/transfer")
def transfer():
    try:
        req = json.loads(request.body())
        validate(req, transfer_schema)
        bank.transfer(
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
        "status": "ok"
    }

    return json.dumps(resp)


application = default_app()
