import _ = require("lodash");
import EventEmitter = require("events");
import express = require("express");
import WebSocket = require("ws");
import http = require("http");
import request = require("request");
var expParse = require("expression-parser");

import {Task, SpotpriceHandler} from "./spot_price_logic";

interface ScriptDesc{
    // TODO: this
}

interface Resource{
    user_requirements: string[];
    provider_requirements: string[];
    evaluate_provider_script: ScriptDesc;
    evaluate_inputs_script: ScriptDesc;
    cost: string;
    get_provider_data: any;// TODO: this
}

interface JobVariables {
    waiting_time: number;
    running_time: number;
    killed_by: "user" | "provider" | "none";
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
    },
    user_account: number // TODO: make this a bit more secure
}

interface TaskOutput{
    exit_code: number;
    stdout: string;
    stderr: string;
}

function sterilizeObject(ob: Object){
    return _.extend(Object.create(null, {}), ob);
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

    constructor(private serverAccountId: number, private central_bank_location: string){
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

        this.server.listen(8080, () => {
            console.log('Listening on %d', this.server.address().port);
        });
    }

    private async chargeUser(req: Request, jobVars: JobVariables){
        var costFunc = expParse(req.resource.cost);
        // Need to sterilize to make sure you don't access prototype etc.
        // TODO: Introduce if statements and use a different library
        // that doesn't evaluate javascript in this context
        var cost = costFunc(sterilizeObject(jobVars));
        var transaction = await fetch(this.central_bank_location, {
            method: "POST",
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: this.serverAccountId,
                to: req.user_account,
                amount: cost
            })
        })

        // TODO: maybe do something with the transaction?
    }

    private baseJobVars = <Partial<JobVariables>>{
        can_rebuy: true,
        user_script_outputs: {},
        provider_script_outputs: {
            correct: true
        }
    }

    private taskTimeout = 3000;

    private async onWebsocketConnect(){
        let request = await this.receive<Request>();
        // TODO: verify this
        this.send({
            "status": "queued"
        })

        let contractStart = Date.now();
        let startTime: number;
        let taskStarted = false;
        let taskKilled = false;
        let task = new Task(request);
        this.spHandler.add_task(task);

        setTimeout(() => {
            if(taskKilled) return;

            // End of the contract without the task being killed, charge and reset variables
            let contractFinish = Date.now();
            if(!taskStarted){
                startTime = contractFinish;
            }

            let jobVars = <JobVariables>_.extend(this.baseJobVars, <Partial<JobVariables>>{
                killed_by: "none",
                provider_data: {
                    spot_price: undefined, // TODO: put something here
                },
                waiting_time: startTime - contractStart,
                running_time: Date.now() - startTime
            })

            contractStart = Date.now();
            if(taskStarted){
                startTime = Date.now();
            }
        }, this.taskTimeout)

        task.onTaskFinished.attach(async output => {
            taskKilled = true;
            this.send({
                "status": "user-terminated"
            });

            let jobVars = <JobVariables>_.extend(this.baseJobVars, <Partial<JobVariables>>{
                killed_by: "user",
                provider_data: {
                    spot_price: undefined, // TODO: put something here
                },
                waiting_time: startTime - contractStart,
                running_time: Date.now() - startTime
            })

            await this.chargeUser(request, jobVars);
        })

        task.onTaskStart.attach(output => {
            this.send({
                "status": "task-start"
            })

            startTime = Date.now();
            taskStarted = true;
        })

        task.onTaskTerminated.attach(async output => {
            taskKilled = true;
            this.send({
                "status": "task-terminated"
            })

            let jobVars = <JobVariables>_.extend(this.baseJobVars, <Partial<JobVariables>>{
                killed_by: "user",
                provider_data: {
                    spot_price: undefined, // TODO: put something here
                },
                waiting_time: startTime - contractStart,
                running_time: Date.now() - startTime
            })

            await this.chargeUser(request, jobVars);
        })
    }
}