import {Task, SpotpriceHandler} from "./spot_price_logic";

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

function id<T>(value: T){
    return value;
}

export default class Transaction{
    private contractStart = Date.now()
    private processStart: number | undefined;

    getFinishedJobVars(killed_by: "user" | "provider" | "none", spot_price: number, times_bought: number): JobVariables{
        let processEnd = Date.now();
        if(this.processStart == undefined){
            this.processStart = processEnd;
        }

        return {
            killed_by: killed_by,
            provider_data: {
                spot_price
            },
            running_time: processEnd - this.processStart,
            times_rebought: 0,
            waiting_time: this.processStart - this.contractStart,
            can_rebuy: true,
            user_script_outputs: {},
            provider_script_outputs: {
                correct: true
            }
        }
    }
    
    onProcessStart(){
        this.processStart = Date.now();
    }
}