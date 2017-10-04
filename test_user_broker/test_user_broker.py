import json
import websocket
import sys
import argparse


def get_tst_json(bid_price, command):
    return {
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
        "bid_price": bid_price,
        "script_parameters": {
            "command": command
        },
        "user_account": 3
    }


def on_message(ws, message):
    print(message)


def on_error(ws, error):
    print(error)


def on_close(ws):
    print("### closed ###")


def on_open(ws):
    tst_json = get_tst_json(options.bid_price, options.command)
    ws.send(json.dumps(tst_json))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test client")
    parser.add_argument("--server", help="The address of the discovery service", required=True)
    parser.add_argument("--command", help="The command to execute on the remote server", required=True)
    parser.add_argument("--bid_price", help="The price to bid for a resource", type=float, required=True)

    options = parser.parse_args()

    ws = websocket.WebSocketApp("ws://" + options.server,
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)
    ws.on_open = on_open
    ws.run_forever()
