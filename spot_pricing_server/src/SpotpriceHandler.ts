import _ = require("lodash");
import SpotpriceTask from "./SpotpriceTask"

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
        spTask.start();
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
