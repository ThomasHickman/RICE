import {Task} from "./tasks"
import {SyncEvent} from 'ts-events';

export default class SpotpriceTask<TaskOutput>{
    public onTaskStart = new SyncEvent<void>();
    public onTaskTerminated = new SyncEvent<void>();
    // This is only emitted for user terminated tasks
    public onTaskFinished = new SyncEvent<TaskOutput | undefined>();
    
    /** The cost since the last spot price change */
    private cost = 0;
    /** The time since the spot price last changed */
    private lastSpotPriceChangeTime: number | undefined;
    private currSpotPrice = 0;
    
    constructor(private task: Task<TaskOutput>, public bidPrice: number){
        this.task.onTaskFinished.attach(x => this.onTaskFinished.post(x));
    }

    start(){
        this.task.start();
        this.onTaskStart.post();
    }

    /**
     * Returns the current spot price cost and resets it to 0
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
        if(this.lastSpotPriceChangeTime == undefined){
            this.lastSpotPriceChangeTime = Date.now();
        }
        
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

    userTerminate(){
        this.task.terminate();
        this.onTaskFinished.post(undefined);
    }
}