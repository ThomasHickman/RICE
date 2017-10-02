import {SpotpriceTask, SpotpriceHandler} from "./spot_price_logic";

describe("integration test", () => {
    let spHandler = new SpotpriceHandler(7);
    let task = new SpotpriceTask(request);
    spHandler.addTask(task);
})