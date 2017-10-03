import json
import websocket

tst_json = {
    "resource": {
        "get_provider_data": [{
            "name": "spot_price",
            "type": "number"
        }],
        "evaluate_provider_script": {
            "file": "correct_system.py",
            "outputs": [{
                "name": "correct",
                "type": "boolean"
            }]
        },
        "user_requirements": [
            "correct spot_price < bid_price",
            "running_time is 30 => killed_by is \"provider\"",
            "can_rebuy"
        ],
        "cost": "spot_price"
    },
    "bid_price": 10,
    "script_parameters": {
        "command": "echo 'hi'"
    },
    "user_account": 2
}


def on_message(ws, message):
    print(message)


def on_error(ws, error):
    print(error)


def on_close(ws):
    print("### closed ###")


def on_open(ws):
    ws.send(json.dumps(tst_json))


if __name__ == "__main__":
    ws = websocket.WebSocketApp("ws://127.0.0.1:8080",
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)
    ws.on_open = on_open
    ws.run_forever()
