"""A central bank for managing scheduling resources"""

import json
from contextlib import contextmanager
from abc import abstractmethod, ABCMeta

from flask import Flask, request, jsonify
from sqlalchemy import Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from jsonschema import validate
import argparse

app = Flask(__name__)
Base = declarative_base()


class Provider(Base):
    __tablename__ = "providers"

    id = Column(Integer, primary_key=True)
    address = Column(String, nullable=False)

    def __init__(self, address):
        self.address = address


class DiscoveryService:
    def __init__(self):
        self.engine = create_engine("sqlite:///discovery_service.db")
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

    def getAll(self):
        with self.session_scope() as session:
            return list(session.query(Provider).all())

    def add_service(self, address):
        with self.session_scope() as session:
            session.add(Provider(address))


ds = DiscoveryService()


@app.route("/query-all")
def queryAll():
    return jsonify({
        "status": "ok",
        "resources": ds.getAll()
    })


@app.route("/add-provider", methods=["POST"])
def create_new_account():
    req = request.get_json()
    ds.add_service(req["address"])

    return jsonify({
        "status": "ok"
    })


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Central bank for a computational scheduling service")
    parser.add_argument("--debug", help="Launch in debug mode", action="store_true")
    parser.add_argument("--port", help="Port to use", type=int, default=8080)
    parser.add_argument("--host", help="Address to use", default="127.0.0.1")

    options = parser.parse_args()
    app.run(host=options.host, port=options.port, use_reloader=options.debug)
