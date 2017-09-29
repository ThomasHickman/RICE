import _ = require("lodash");
import EventEmitter = require("events");
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
    exit_code: number;
    stdout: string;
    stderr: string;
}

export class Task{
    public bid_price: number;
    
    public onTaskStart = new SyncEvent<void>();
    public onTaskTerminated = new SyncEvent<void>();
    // This is only emitted for user terminated tasks
    public onTaskFinished = new SyncEvent<TaskOutput>();
    
    private process = <cp.ChildProcess | undefined>undefined;
    private stdoutBuffer = "";
    private stderrBuffer = "";    

    constructor(private request: Request){
    }

    start(){
        this.onTaskStart.post();
        
        const args = `run python ${this.request.script_parameters.command}`;
        this.process = cp.spawn("docker", args.split("\n"));

        this.process.stdout.on("data", data => {
            this.stderrBuffer += data;
        })

        this.process.stderr.on("data", data => {
            this.stderrBuffer += data;
        })

        this.process.on("close", exit_code => {
            this.onTaskFinished.post({
                exit_code: exit_code,
                stdout: this.stdoutBuffer,
                stderr: this.stderrBuffer
            })
        })
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
    private tasks_running = <Task[]>[];
    private tasks_queued = <Task[]>[];

    constructor(private max_tasks: number) {
    }

    private start_task(task: Task) {
        this.tasks_running.push(task);
        task.onTaskTerminated.attach(() => this.on_task_finish(task))
        task.start();
    }

    private on_task_finish(task: Task) {
        _.remove(this.tasks_running, task)
    }
    
    add_task(task: Task) {
        let bottom_task;
        if (this.tasks_running.length < this.max_tasks) {
            this.start_task(task);
        }
        else {
            bottom_task = _.minBy(this.tasks_running, t => t.bid_price);
            if (bottom_task != undefined && bottom_task.bid_price < task.bid_price) {
                _.remove(this.tasks_running, bottom_task)
                bottom_task.terminate();
                this.start_task(task);
            }
            else {
                this.tasks_queued.push(task);
            }
        }
    }

    set_max_tasks(new_size: number) {
        if (new_size > this.max_tasks) {
            _.sortBy(this.tasks_queued, "bid_price")
            let new_elements = new_size - this.tasks_running.length;

            for(let i = 0;i < new_elements;i++) {
                let new_task = this.tasks_queued.pop();
                if(new_task != undefined){
                    this.start_task(new_task);
                }
                else{
                    break;
                }
            }
        }
        else if (new_size < this.tasks_running.length) {
            _.sortBy(this.tasks_running, "bid_price");
            let elements_to_remove = this.tasks_running.length - new_size;
            
            for(let i = 0;i < elements_to_remove;i++) {
                let new_task = <Task>this.tasks_running.pop(); // This is always going to return something
                new_task.terminate();
            }
        }

        this.max_tasks = new_size;
    }
}