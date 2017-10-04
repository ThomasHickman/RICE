set -x

docker network create rice

docker run -v $(pwd)/central_bank:/central_bank --name="central_bank" --network="rice" python:3 \
    python /central_bank/central_bank.py --debug --port 80 --host 0.0.0.0

docker run -v $(pwd)/discovery_service:/discovery_service --name="discovery_service" --network="rice" python:3 \
    python /discovery_service/discovery_service.py  --debug --port 80 --host 0.0.0.0

CB_IP = $(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' central_bank)
DS_IP = $(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' discovery_service)

# Create accounts for the user and server
docker exec discovery_service curl $(CB_IP)/new-account -X POST
docker exec discovery_service curl $(CB_IP)/new-account -X POST

docker run -v $(pwd)/spot_pricing_server:/spot_pricing_server --name="spot_pricing_server" --network="rice" node \
    python /spot_pricing_server/dist/src/Server.js --port 80 --host 0.0.0.0 --central-bank $(CB_IP) --account-id 1

SP_IP = $(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' spot_pricing_server)

docker run -v $(pwd)/test_user_broker:/test_user_broker --name="test_user_broker" --network="rice" python:3 \
    python /test_user_broker/test.py --server $(SP_IP) --command "python -c print('hello')"