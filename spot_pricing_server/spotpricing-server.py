import requests
import json
import asyncio
from bottle import default_app, route, get, run, request, debug
from bottle.ext.websocket import GeventWebSocketServer
from bottle.ext.websocket import websocket

discovery_service = "127.0.0.1"

dev=True

debug(dev)

def tell_discovery_server():
    with open("commdities/spot_pricing.json", "r") as f:
        spot_pricing_comm = json.load(f)
    
    r = requests.post(f"${discovery_service}/new-resource", data=spot_pricing_comm)

    assert r.status_code == 200
    resp_json = r.json()
    assert resp_json.status == "ok"

def main():
    tell_discovery_server()

@get("/run", apply=[websocket])
def echo(ws):
    while True:
        msg = ws.receive()
        if msg is not None:
            ws.send(msg)
        else:
            break

@get("/parameter/spot_price")
def get_parameters():
    return "[1.2, 1.4, 1.6, 1.2, 1.5, 1.7]"

run(host='127.0.0.1', port=8080, server=GeventWebSocketServer, reloader=dev)