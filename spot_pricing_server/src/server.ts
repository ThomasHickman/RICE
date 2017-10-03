import _ = require("lodash");
import express = require("express");
import WebSocket = require("ws");
import http = require("http");
var expParse = require("expression-parser");
import Transaction from "./spotprice_charger";
import {PythonDockerTask} from "./tasks"
var fetch = require("node-fetch");
import commander = require("commander");

import {SpotpriceTask, SpotpriceHandler} from "./spot_price_logic";

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
    provider_data: object;
    provider_script_outputs: object;
    user_script_outputs: object;
}

interface Request{
    resource: Resource;
    bid_price: number;
    script_parameters: {
        command: string;
    },
    user_account: number // TODO: make this a bit more secure
}

function sterilizeObject(ob: object){
    return _.extend(Object.create(null, {}), ob);
}

class Server{
    private socket: WebSocket;
    private promiseFulfil: (m: any) => void;
    private send: typeof WebSocket.prototype.send;
    private receive<ob>(){
        return new Promise<ob>((fulfil, _) => {
            this.promiseFulfil = fulfil;
        })
    }
    private app = express();
    private server = http.createServer(this.app);
    private wss = new WebSocket.Server({server: this.server});
    private spotPriceHistory = [1.2, 1.4, 1.6, 1.2, 1.5, 1.7];

    private spHandler = new SpotpriceHandler(7);

    private getSpotPriceHistory(){
        return this.spotPriceHistory; // TODO: do something better here
    }

    constructor(private serverAccountId: number, private centralBankLocation: string, port: number){
        this.app.get("/parameters/spot_price", (_, res) => {
            res.send(this.getSpotPriceHistory());
        });

        this.wss.on('connection', async (ws, _) => {
            this.socket = ws;
            this.send = (message: string) => {
                this.socket.send(JSON.stringify(message))
            }

            ws.on('message', (message: string) => {
                this.promiseFulfil(JSON.parse(message));
            });
            
            try{
                await this.onWebsocketConnect();
            }
            catch(e){
                this.send({
                    status: "error",
                    data: e
                })
                ws.close();
            }
        })

        this.server.listen(port, () => {
            console.log('Listening on %d', this.server.address().port);
        });
    }

    private async chargeUser(req: Request, jobVars: JobVariables){
        var costFunc = expParse(req.resource.cost);
        // Need to sterilize to make sure you don't access prototype etc.
        // TODO: Introduce if statements and use a different library
        // that doesn't evaluate javascript in this context
        var cost = costFunc(sterilizeObject(jobVars));
        var transaction = await fetch(`http://${this.centralBankLocation}/transfer`, {
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

    private taskTimeout = 3000;

    private async onWebsocketConnect(){
        let request = await this.receive<Request>();
        // TODO: verify this
        this.send({
            "status": "submitted"
        })

        let spTask = new SpotpriceTask(new PythonDockerTask(request.script_parameters.command), request.bid_price);
        this.spHandler.addTask(spTask);
        let transaction = new Transaction();
        let timesBought = 1;

        let taskContinue = () => {
            this.chargeUser(request, 
                transaction.getFinishedJobVars("none", spTask.popCost(), timesBought));
            transaction = new Transaction();
            this.send({
                "status": "task-continued"
            });
            
            timesBought++;
        }
        let timeout = setTimeout(() => taskContinue(), this.taskTimeout)

        spTask.onTaskFinished.attach(output => {
            this.send({
                status: "task-finished",
                output
            });

            this.chargeUser(request, 
                transaction.getFinishedJobVars("user", spTask.popCost(), timesBought));
            clearTimeout(timeout);

            this.socket.close();
        })

        spTask.onTaskStart.attach(() => {
            this.send({
                status: "task-start"
            });

            transaction.onProcessStart();
        })

        spTask.onTaskTerminated.attach(() => {
            this.send({
                status: "task-terminated"
            });

            this.chargeUser(request, 
                transaction.getFinishedJobVars("provider", spTask.popCost(), timesBought));

            this.socket.close();
        })
    }
}

function main(){
    commander
        .version("0.0.1")
        .option("--central-bank <location>", "The location of the central bank")
        .option("--account-id <id>", "The id of of the banks account", parseInt)
        .option("--port <port>", "The port to serve the requests over", parseInt, 80)
        .parse(process.argv)
    
    new Server(commander.accountId, commander.centralBank, commander.port);
}


main();