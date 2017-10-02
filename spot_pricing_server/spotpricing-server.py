import requests
from json import loads as parse_json, dumps as dump_json
from sanic import Sanic
from sanic.response import json
import numpy
from jsonschema import validate, ValidationError
import asyncio
import heapq

discovery_service = "127.0.0.1"
central_bank = "127.0.0.1"
dev = True

app = Sanic(__name__)


def tell_discovery_server():
    with open("commdities/spot_pricing.json", "r") as f:
        spot_pricing_comm = parse_json(f)

    r = requests.post(f"${discovery_service}/new-resource", data=spot_pricing_comm)

    assert r.status_code == 200
    resp_json = r.json()
    assert resp_json.status == "ok"


def main():
    tell_discovery_server()


run_schema = {
    "type": "object",
    "properties": {
        "resource": {"type": "string"},
        "bid_price": {"type": "number"},
        "script_parameters": {
            "type": "object",
            "paramters": {
                "command": {"type": "string"}
            }
        }
    }
}


class Task:
    def __init__(self, request):
        self.bid_price = request["bid_price"]
        self.request = request

    def start(self):
        asyncio.create_subprocess_exec()

    def terminate(self):
        pass


class SpotpriceHandler:
    def __init__(self, max_tasks):
        # Both of these contain elements (priority, task)
        self.tasks_running = []
        self.tasks_queued = []

        self._max_tasks = max_tasks

    def start_task(self, task):
        self.tasks_running.append(task)
        task.on_task_finish = self.on_task_finish
        task.start()

    def add_task(self, task: Task):
        if len(self.tasks_running) < self._max_tasks:
            self.start_task(task)
        else:
            bottom_task = min(self.tasks_running, lambda t: t.bid_price)
            if bottom_task.bid_price < task.bid_price:
                self.tasks_running.remove(bottom_task)
                bottom_task.terminate()

                self.start_task(task)
            else:
                self.tasks_queued.append(task)

    def on_task_finish(self, task):
        self.tasks_running.remove(task)

    def set_max_tasks(self, new_size):
        if new_size > self._max_tasks:
            self.tasks_queued.sort(key=lambda t: t.bid_price)
            new_elements = new_size - self._max_tasks

            for _ in range(new_elements):
                task = self.tasks_queued.pop()
                self.start_task(task)
        else:
            self.tasks_running.sort(key=lambda t: t.bid_price)
            elements_to_remove = self._max_tasks - new_size

            for _ in range(elements_to_remove):
                task = self.tasks_running.pop()
                task.terminate()


handler = SpotpriceHandler(7)


@app.websocket("/run")
async def run(request, ws):
    keep_alive = asyncio.Condition()

    def send_message(message):
        ws.send(dump_json({
            type: message
        }))

    task = Task(request, send_message)

    req = parse_json(await ws.recv())
    validate(req, run_schema)

    await keep_alive


@app.route("/parameters/spot_price")
def get_parameters():
    return "[1.2, 1.4, 1.6, 1.2, 1.5, 1.7]"


def get_reserve_price(floor_price, ceil_price, prev):
    return -0.7 * prev + numpy.random.normal(0, 0.39 * (ceil_price - floor_price))


def get_prices(floor_price, ceil_price):
    curr_price = 0
    while True:
        yield curr_price
        curr_price = get_reserve_price(floor_price, ceil_price, curr_price)
