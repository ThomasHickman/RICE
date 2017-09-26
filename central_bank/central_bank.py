import sqlite3
import requests
import json
import asyncio
from bottle import default_app, route, get, post, run, request, debug
import os

debug(True)

database_path = "database.db"


class Bank:
    def __init__(self):
        if not os.path.exists(database_path):
            self.conn = self.create_database()
        else:
            self.conn = sqlite3.connect(database_path)

    def create_database():
        pass

    def transfer(self, from_account, to_account):
        c = self.conn.cursor()


@post("/transfer")
def transfer():
    req = json.loads(request.body())
