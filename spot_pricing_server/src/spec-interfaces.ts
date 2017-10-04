export interface JobVariables {
    waiting_time: number;
    running_time: number;
    killed_by: "user" | "provider";
    can_rebuy: boolean;
    times_rebought: number;
    provider_data: object;
    provider_script_outputs: object;
    user_script_outputs: object;
}

export interface ScriptDesc{
    // TODO: this
}

export interface Resource{
    user_requirements: string[];
    provider_requirements: string[];
    evaluate_provider_script: ScriptDesc;
    evaluate_inputs_script: ScriptDesc;
    cost: string;
    get_provider_data: any;// TODO: this
}

export interface JobRequest<Params>{
    resource: Resource;
    bid_price: number;
    script_parameters: Params;
    user_account: number;
}

export interface BankError{
    status: string;
    error_message: string;
}

export type BankResponse = BankError | {
    status: "ok"
}