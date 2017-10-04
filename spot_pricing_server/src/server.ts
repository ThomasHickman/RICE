import _ = require("lodash");
import express = require("express");
import WebSocket = require("ws");
import http = require("http");
var expParse = require("expression-parser");
import fetch from "node-fetch";
import {ArgumentParser} from "argparse";

import {PythonDockerTask} from "./tasks";
import Transaction from "./Transaction";
import SpotpriceTask from "./SpotpriceTask";
import SpotpriceHandler from "./SpotpriceHandler";
import {JobRequest, JobVariables, BankError} from "./spec-interfaces";

function sterilizeObject(ob: object){
    return _.extend(Object.create(null, {}), ob);
}

class Server{
    private app = express();
    private server = http.createServer(this.app);
    private wss = new WebSocket.Server({server: this.server});
    private spotPriceHistory = [1.2, 1.4, 1.6, 1.2, 1.5, 1.7];

    private spHandler = new SpotpriceHandler(2);

    private getSpotPriceHistory(){
        return this.spotPriceHistory; // TODO: do something better here
    }

    constructor(private serverAccountId: number, private centralBankLocation: string, port: number, hostname: string){
        this.app.get("/parameters/spot_price", (_, res) => {
            res.send(this.getSpotPriceHistory());
        });

        this.wss.on('connection', async (ws, _) => {
            new WebsocketConnection(ws, this.chargeUser.bind(this), this.spHandler);
        })

        this.server.listen(port, hostname, () => {
            console.log('Listening on %d', this.server.address().port);
        });
    }

    /**
     * 
     * @param req 
     * @param jobVars 
     * @returns Whether the user has been successfully charged
     */
    private async chargeUser(req: JobRequest<any>, jobVars: JobVariables) {
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

        return <BankError>await transaction.json();
    }
}

class WebsocketConnection{
    private socketEnded = false;
    
    private send(message: object) {
        if(!this.socketEnded){
            let mesStr = JSON.stringify(message)
            console.log("send: " + mesStr)
            this.socket.send(mesStr)
        }
    }
    private promiseFulfil: (m: any) => void;
    private receive<ob>(){
        return new Promise<ob>((fulfil, _) => {
            this.promiseFulfil = fulfil;
        })
    }

    private readonly taskTimeout = 3000;
    private request: JobRequest<any>;
    private transaction: Transaction;
    private timesBought = 1;
    private spTask: SpotpriceTask<any>;
    private timeout: NodeJS.Timer;
    
    private verifyRequest(req: JobRequest<any>){
        if(req.bid_price < 0){
            throw Error("Cannot have a bid price of less than 0");
        }

        // TODO: the rest
    }

    constructor(private socket: WebSocket,
                private chargeUser: (req: JobRequest<any>, jobVars: JobVariables) => Promise<BankError>,
                private spHandler: SpotpriceHandler){
        socket.on('message', (message: string) => {
            console.log("receive: " + message)
            this.promiseFulfil(JSON.parse(message));
        });

        (async () => {
            try{
                await this.onWebsocketConnect();
            }
            catch(e){
                this.send({
                    status: "error",
                    data: e.toString()
                })
                this.socket.close();
            }
    
            this.socket.on("close", () => {
                this.socketEnded = true;
                if(this.spTask != undefined){
                    this.spTask.terminate();
                }
                console.log("User terminated")
            });
        })()
    }

    private async onTaskContinue(){
        let chargedStatus = await this.chargeUser(this.request, 
            this.transaction.getFinishedJobVars("none", this.spTask.popCost(), this.timesBought));

        if(chargedStatus.status == "ok"){
            this.transaction = new Transaction();
            this.send({
                "status": "task-continued"
            });
            
            this.timesBought++;

            this.timeout = setTimeout(() => this.onTaskContinue(), this.taskTimeout)
        }
        else{
            this.send({
                "status": "charging-error",
                "error": chargedStatus
            })

            this.spTask.terminate();
        }
    }

    private async onTaskFinished(output: any){
        if(this.timeout != undefined)
            clearTimeout(this.timeout);
        
        let chargedStatus = await this.chargeUser(this.request, 
            this.transaction.getFinishedJobVars("user", this.spTask.popCost(), this.timesBought));
        
        if(chargedStatus.status == "ok"){
            this.send({
                status: "task-finished",
                output
            });
        }
        else{
            this.send({
                "status": "charging-error",
                "error": chargedStatus
            })
        }

        this.socket.close();
    }

    private onTaskTerminated(){
        clearTimeout(this.timeout);
        this.send({
            status: "task-terminated"
        });

        this.socket.close();
    }

    private onTaskStart(){
        this.send({
            status: "task-start"
        });

        this.timeout = setTimeout(() => this.onTaskContinue(), this.taskTimeout);

        this.transaction.onProcessStart();
    }

    private async onWebsocketConnect(){
        this.request = await this.receive<JobRequest<any>>();
        this.verifyRequest(this.request);
        
        this.send({
            "status": "submitted"
        });
        
        this.spTask = new SpotpriceTask(new PythonDockerTask(this.request.script_parameters.command), this.request.bid_price);

        this.spTask.onTaskFinished.attach(async output => {
            this.onTaskFinished(output);
        })

        this.spTask.onTaskStart.attach(() => {
            this.onTaskStart();
        })

        this.spTask.onTaskTerminated.attach(async () => {
            this.onTaskTerminated();
        })

        this.transaction = new Transaction();
        this.spHandler.addTask(this.spTask);
    }
}

function main(){
    var parser = new ArgumentParser({description: "A test spot pricing server"});
    parser.addArgument(["--central_bank"], {
        help: "The location of the central bank",
        required: true
    })
    parser.addArgument(["--account_id"], {
        help: "The id of of the banks account",
        required: true,
        type: "int"
    })
    parser.addArgument(["--port"], {
        help: "The port to serve the requests over",
        required: true,
        type: "int"
    })
    parser.addArgument(["--host"], {
        help: "The hostname to serve the request over",
        required: true
    })

    var args = parser.parseArgs();
    
    new Server(args.account_id, args.central_bank, args.port, args.host);
}


main();