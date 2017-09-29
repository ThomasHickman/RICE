import _ = require("lodash");
import EventEmitter = require("events");
import express = require("express");
import WebSocket = require("ws");
import http = require("http");
import {Task, SpotpriceHandler} from "./spot_price_logic"

interface Resource{
    // TODO: this
}

interface JobVariables {
    waiting_time: number;
    running_time: number;
    killed_by: "user" | "provider";
    can_rebuy: boolean;
    times_rebought: number;
    provider_data: Object;
    provider_script_outputs: Object;
    user_script_outputs: Object;
}

interface Request{
    resource: Resource;
    bid_price: number;
    script_parameters: {
        command: string;
    }
}

interface TaskOutput{
    exit_code: number;
    stdout: string;
    stderr: string;
}


class Server{
    private socket: WebSocket;
    private promiseFulfil: (m: any) => void;
    private send: typeof WebSocket.prototype.send;
    private receive<ob>(){
        return new Promise<ob>((fulfil, reject) => {
            this.promiseFulfil = fulfil;
        })
    }
    private app = express();
    private server = http.createServer(this.app);
    private wss = new WebSocket.Server({server: this.server});
    private spotPriceHistory = [1.2, 1.4, 1.6, 1.2, 1.5, 1.7];

    private spHandler = new SpotpriceHandler(7);

    private getSpotPriceHistory(){
        return this.spotPriceHistory;
    }

    constructor(){
        this.app.get("/parameters/spot_price", (req, res) => {
            res.send(this.getSpotPriceHistory());
        });

        this.wss.on('connection', (ws, req) => {
            this.send = this.socket.send.bind(this.socket);
            this.socket = ws;

            ws.on('message', (message) => {
                this.promiseFulfil(message);
            });
            
            this.onWebsocketConnect();
        })
    }

    private async chargeUser(request: Request, jobStatus: JobStatus){
        // TODO: maybe change this logic so that a middle server charges a user
    }

    private async onWebsocketConnect(){
        let request = await this.receive<Request>();
        // TODO: verify this
        this.send({
            "status": "queued"
        })

        let task = new Task(request);
        spHandler.add_task(task);

        task.onTaskFinished.attach(async output => {
            this.send({
                "status": "user-terminated"
            });

            await this.chargeUser(request, jobStatus);
        })

        task.onTaskStart.attach(output => {
            this.send({
                "status": "task-start"
            })
        })

        task.onTaskStart.attach(async output => {
            this.send({
                "status": "task-terminated"
            })

            await this.chargeUser(request, jobStatus);
        })
    }
}

server.listen(8080, function listening() {
  console.log('Listening on %d', server.address().port);
});