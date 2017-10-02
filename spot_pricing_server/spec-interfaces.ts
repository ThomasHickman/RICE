interface Resource{
    // TODO: this
}

interface JobVariables {
    waiting_time: number;
    running_time: number;
    killed_by: "user" | "provider";
    can_rebuy: boolean;
    times_rebought: number;
    provider_data: object;
    provider_script_outputs: object;
    user_script_outputs: object;
}

interface JobRequest<Params>{
    resource: Resource;
    bid_price: number;
    script_parameters: Params
}