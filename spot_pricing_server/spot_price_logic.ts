import _ = require("lodash");
import {SyncEvent} from 'ts-events';
import cp = require("child_process");

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
    exitCode: number;
    stdout: string;
    stderr: string;
}

export class SpotpriceTask{
    public bid_price: number;
    
    public onTaskStart = new SyncEvent<void>();
    public onTaskTerminated = new SyncEvent<void>();
    // This is only emitted for user terminated tasks
    public onTaskFinished = new SyncEvent<TaskOutput>();
    
    private process = <cp.ChildProcess | undefined>undefined;
    private stdoutBuffer = "";
    private stderrBuffer = "";
    /** The cost since the last spot price change */
    private cost = 0;
    /** The time since the spot price last changed */
    private lastSpotPriceChangeTime: number;
    private currSpotPrice: number;
    
    constructor(private request: Request){
    }

    start(spotPrice: number){
        this.onTaskStart.post();
        this.currSpotPrice = spotPrice;
        this.lastSpotPriceChangeTime = Date.now();
        
        const args = `run python ${this.request.script_parameters.command}`;
        this.process = cp.spawn("docker", args.split("\n"));

        this.process.stdout.on("data", data => {
            this.stderrBuffer += data;
        })

        this.process.stderr.on("data", data => {
            this.stderrBuffer += data;
        })

        this.process.on("close", exitCode => {
            this.onTaskFinished.post({
                exitCode: exitCode,
                stdout: this.stdoutBuffer,
                stderr: this.stderrBuffer
            })
        })
    }

    /** 
     * Returns the current spot price cost and 
     */
    handleCost(){
        this.changeSpotPrice(this.currSpotPrice);
        
        let cost = this.cost;
        this.cost = 0;
        return cost;
    }
    
    private calculateSpotPriceCost(rate: number, time: number){
        return rate * time / 1000*60*60 //= 1 hour
    }

    changeSpotPrice(newRate: number){
        let changeTime = Date.now()
        
        this.cost += this.calculateSpotPriceCost(
            this.currSpotPrice,
            changeTime - this.lastSpotPriceChangeTime
        )

        this.currSpotPrice = newRate;
        this.lastSpotPriceChangeTime = changeTime;
    }

    terminate(){
        if (this.process == undefined){
            throw Error("Task.terminate: cannot terminate non running process")
        }
        
        this.process.kill();
        this.onTaskTerminated.post();
    }
}

export class SpotpriceHandler {
    private tasksRunning = <SpotpriceTask[]>[];
    private tasksQueued = <SpotpriceTask[]>[];
    private spotPrice: number;

    constructor(private max_tasks: number) {
    }

    private startTask(task: SpotpriceTask) {
        this.tasksRunning.push(task);
        task.onTaskTerminated.attach(() => this.onTaskFinish(task));
        this.recalculateSpotPrice();
        task.start(this.spotPrice);
    }

    private onTaskFinish(task: SpotpriceTask) {
        _.remove(this.tasksRunning, task);
        this.moveOverTasks();
    }

    private recalculateSpotPrice(){
        _.sortBy(this.tasksRunning, "bid_price");
        this.spotPrice = this.tasksRunning[0].bid_price;

        this.tasksRunning.forEach(task => {
            task.changeSpotPrice(this.spotPrice);
        })
    }

    addTask(task: SpotpriceTask) {
        let bottom_task;
        if (this.tasksRunning.length < this.max_tasks) {
            this.startTask(task);
        }
        else {
            bottom_task = _.minBy(this.tasksRunning, t => t.bid_price);
            if (bottom_task != undefined && bottom_task.bid_price < task.bid_price) {
                _.remove(this.tasksRunning, bottom_task);
                bottom_task.terminate();
                this.startTask(task);
            }
            else {
                this.tasksQueued.push(task);
            }
        }
    }

    /** 
     * This is called when a task is removed or the max_tasks variable changes,
     *  it either queues tasks or terminates them
     */
    private moveOverTasks(){
        if (this.max_tasks > this.tasksRunning.length) {
            _.sortBy(this.tasksQueued, "bid_price")
            let new_elements = this.max_tasks - this.tasksRunning.length;

            for(let i = 0;i < new_elements;i++) {
                let new_task = this.tasksQueued.pop();
                if(new_task != undefined){
                    this.startTask(new_task);
                }
                else{
                    break;
                }
            }
        }
        else if (this.max_tasks < this.tasksRunning.length) {
            _.sortBy(this.tasksRunning, "bid_price");
            let elements_to_remove = this.tasksRunning.length - this.max_tasks;
            
            for(let i = 0;i < elements_to_remove;i++) {
                let new_task = <SpotpriceTask>this.tasksRunning.pop(); // This is always going to return something
                new_task.terminate();
            }
            this.recalculateSpotPrice();
        }
    }

    setMaxTasks(new_size: number) {
        this.max_tasks = new_size;
        this.moveOverTasks();
    }
}