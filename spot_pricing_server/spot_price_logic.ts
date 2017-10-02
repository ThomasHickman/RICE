import _ = require("lodash");
import {SyncEvent} from 'ts-events';
import {Task} from "./tasks"

export class SpotpriceTask<TaskOutput>{
    public onTaskStart = new SyncEvent<void>();
    public onTaskTerminated = new SyncEvent<void>();
    // This is only emitted for user terminated tasks
    public onTaskFinished = new SyncEvent<TaskOutput>();
    
    /** The cost since the last spot price change */
    private cost = 0;
    /** The time since the spot price last changed */
    private lastSpotPriceChangeTime: number;
    private currSpotPrice: number;
    
    constructor(private task: Task<TaskOutput>, public bidPrice: number){
    }

    start(spotPrice: number){
        this.task.start();
        this.onTaskStart.post();
        this.currSpotPrice = spotPrice;
        this.lastSpotPriceChangeTime = Date.now();
    }

    /**
     * Returns the current spot price cost and 
     */
    popCost(){
        this.changeSpotPrice(this.currSpotPrice);

        const cost = this.cost;
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
        this.task.terminate();
        this.onTaskTerminated.post();
    }
}

export class SpotpriceHandler {
    private tasksRunning = <SpotpriceTask<any>[]>[];
    private tasksQueued = <SpotpriceTask<any>[]>[];
    private spotPrice: number;

    constructor(private maxTasks: number) {
    }

    private startTask(spTask: SpotpriceTask<any>) {
        this.tasksRunning.push(spTask);
        spTask.onTaskTerminated.attach(() => this.onTaskFinish(spTask));
        this.recalculateSpotPrice();
        spTask.start(this.spotPrice);
    }

    private onTaskFinish(spTask: SpotpriceTask<any>) {
        _.remove(this.tasksRunning, spTask);
        this.moveOverTasks();
    }

    private recalculateSpotPrice() {
        _.sortBy(this.tasksRunning, "bid_price");
        this.spotPrice = this.tasksRunning[0].bidPrice;

        this.tasksRunning.forEach(task => {
            task.changeSpotPrice(this.spotPrice);
        });
    }

    public addTask(spTask: SpotpriceTask<any>) {
        let bottom_task;
        if (this.tasksRunning.length < this.maxTasks) {
            this.startTask(spTask);
        }
        else {
            bottom_task = _.minBy(this.tasksRunning, (t) => t.bidPrice);
            if (bottom_task !== undefined && bottom_task.bidPrice < spTask.bidPrice) {
                _.remove(this.tasksRunning, bottom_task);
                bottom_task.terminate();
                this.startTask(spTask);
            }
            else {
                this.tasksQueued.push(spTask);
            }
        }
    }

    /**
     * This is called when a task is removed or the max_tasks variable changes,
     *  it either queues tasks or terminates them
     */
    private moveOverTasks(){
        if (this.maxTasks > this.tasksRunning.length) {
            _.sortBy(this.tasksQueued, "bid_price")
            const newElements = this.maxTasks - this.tasksRunning.length;

            for(let i = 0;i < newElements;i++) {
                const newTask = this.tasksQueued.pop();
                if(newTask != undefined){
                    this.startTask(newTask);
                }
                else{
                    break;
                }
            }
        }
        else if (this.maxTasks < this.tasksRunning.length) {
            _.sortBy(this.tasksRunning, "bid_price");
            let elementsToRemove = this.tasksRunning.length - this.maxTasks;

            for (let i = 0; i < elementsToRemove; i++) {
                const new_task = this.tasksRunning.pop() as SpotpriceTask<any>; // This is always going to return something
                new_task.terminate();
            }
            this.recalculateSpotPrice();
        }
    }

    public setMaxTasks(new_size: number) {
        this.maxTasks = new_size;
        this.moveOverTasks();
    }
}
