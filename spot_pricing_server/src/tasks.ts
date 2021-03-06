import {SyncEvent} from 'ts-events';
import cp = require("child_process");
var stringArgv = require('string-argv');

export abstract class Task<Output>{
    onTaskFinished = new SyncEvent<Output>();
    
    abstract terminate(): void;
    abstract start(): void;
}

export interface CommandLineOutput {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export class PythonDockerTask extends Task<CommandLineOutput>{
    private process: cp.ChildProcess | undefined;
    private stdoutBuffer = "";
    private stderrBuffer = "";
    private terminated = false;

    constructor(private command: string){
        super()
    }

    start(){
        const args = `run python ${this.command}`;
        this.process = cp.spawn("docker", stringArgv(args));

        this.process.stdout.on("data", data => {
            this.stdoutBuffer += data;
        })

        this.process.stderr.on("data", data => {
            this.stderrBuffer += data;
        })

        this.process.on("close", exitCode => {
            if(exitCode != null){
                this.onTaskFinished.post({
                    exitCode: exitCode,
                    stdout: this.stdoutBuffer,
                    stderr: this.stderrBuffer
                })
            }
        })
    }

    terminate(){
        if (this.process == undefined){
            throw Error("terminate: cannot terminate non running process")
        }

        this.process.kill();
    }
}