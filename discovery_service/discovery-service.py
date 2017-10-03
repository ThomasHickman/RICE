from bottle import default_app, route
import json
import http.server

providers = [
    "provider1"
]


@route('/')
def main():
    output = {
        "status": "ok",
        "resources": providers
    }

    return json.dumps(output)


application = default_app()
