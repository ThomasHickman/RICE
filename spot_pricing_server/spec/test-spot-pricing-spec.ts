import SpotpriceTask from "../src/SpotpriceTask";
import SpotpriceHandler from "../src/SpotpriceHandler";
import {PythonDockerTask} from "../src/tasks";

describe("task spawning", () => {
    function createTask(cost: number): [SpotpriceTask<any>, jasmine.Spy, jasmine.Spy] {
        let spTask = new SpotpriceTask(task, cost);
        let taskStartedSpy = jasmine.createSpy("onTaskStart");
        spTask.onTaskStart.attach(taskStartedSpy);
        let taskTerminatedSpy = jasmine.createSpy("onTaskTerminated");
        spTask.onTaskTerminated.attach(taskTerminatedSpy);
        spHandler.addTask(spTask);

        return [spTask, taskStartedSpy, taskTerminatedSpy];
    }

    const task = new PythonDockerTask("python -c 'while True: pass'");
    let spHandler: SpotpriceHandler;
    let task1: SpotpriceTask<any>, task2: SpotpriceTask<any>;
    let taskStarted1: jasmine.Spy, taskStarted2: jasmine.Spy;
    let taskTerminated1: jasmine.Spy, taskTerminated2: jasmine.Spy;

    beforeEach(() => {
        spHandler = new SpotpriceHandler(1);
        [task1, taskStarted1, taskTerminated1] = createTask(10);
        [task2, taskStarted2, taskTerminated2] = createTask(5);
    })

    it("maintains correct starting order", function () {
        expect(taskStarted1).toHaveBeenCalled();
        expect(taskStarted2).not.toHaveBeenCalled();
    })

    it("requeues tasks when a task is terminated", function () {
        task1.terminate();
        expect(taskStarted2).toHaveBeenCalled();
    })

    it("requeues tasks when pool size is increased", function () {
        spHandler.setMaxTasks(2);
        expect(taskStarted2).toHaveBeenCalled();
    })

    it("queues tasks of higher priority", function () {
        let taskStarted3 = createTask(20)[1];
        expect(taskStarted3).toHaveBeenCalled();
        expect(taskTerminated1).toHaveBeenCalled();
    })
})