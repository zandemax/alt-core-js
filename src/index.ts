import * as pad from 'pad';
import { loadAllActions } from './actionLoading';
import { generateSequenceDiagram, initDiagramCreation } from './diagramDrawing';
import { getLogger } from './logging';
import { Action } from './model/Action';
import { ActionType } from './model/ActionType';
import { Scenario } from './model/Scenario';
import { TestResult } from './model/TestResult';
import { loadAllScenarios, loadScenariosById } from './scenarioLoading';
import { loadYamlConfiguration } from './yamlParsing';

const RESULTS: Map<string, TestResult[]> = new Map();

const NUM_PARALLEL_RUNS = 10;

let OUT_DIR = '';

// increase the pixel-size (width/height) limit of PlantUML (the default is 4096 which is not enough for some diagrams)
process.env.PLANTUML_LIMIT_SIZE = '16384';

export const runScenario = (
    scenarioPath: string,
    actionDir: string,
    outDir = 'out',
    envConfigFile: string,
): void => {
    try {
        if (typeof scenarioPath === 'undefined' || scenarioPath === '') {
            getLogger('unknown').error(
                'Please provide correct path to the SCENARIO file!',
            );
            process.exit(1);
        }
        if (typeof actionDir === 'undefined' || actionDir === '') {
            getLogger('unknown').error(
                'Please provide correct path to the ACTION files!',
            );
            process.exit(1);
        }
        getLogger('unknown').info(
            `Starting scenario: ${scenarioPath} (actions: ${actionDir}, out: ${outDir}, envConfig: ${envConfigFile})`,
        );

        OUT_DIR = outDir;

        const envConfig = envConfigFile
            ? loadYamlConfiguration(envConfigFile)
            : {};

        const actions: Action[] = loadAllActions(actionDir, envConfig);

        const scenarios: Scenario[] = scenarioPath.endsWith('yaml')
            ? loadScenariosById(scenarioPath, actions)
            : loadAllScenarios(scenarioPath, actions);

        processScenarios(scenarios);
    } catch (e) {
        getLogger('unknown').error(e);
    }
};

async function processScenarios(scenarios: Scenario[]): Promise<void> {
    for (let i = 0; i < scenarios.length; i += NUM_PARALLEL_RUNS) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(
            scenarios
                .slice(i, i + NUM_PARALLEL_RUNS)
                .map(invokeActionsSynchronously),
        );
    }
    printResults();
    stopProcessIfUnsuccessfulResults();
}

async function invokeActionsSynchronously(scenario: Scenario): Promise<void> {
    const scenarioName = scenario.name;
    RESULTS.set(scenarioName, []);

    const ctx = { scenario: scenarioName };
    const MSG_WIDTH = 100;

    getLogger(scenarioName).debug(pad(MSG_WIDTH, '#', '#'), ctx);
    getLogger(scenarioName).debug(
        pad(
            `#### (S): ${scenarioName}: ${scenario.description} `,
            MSG_WIDTH,
            '#',
        ),
        ctx,
    );
    getLogger(scenarioName).debug(pad(MSG_WIDTH, '#', '#'), ctx);
    initDiagramCreation(scenarioName);

    const timeDiffInMs = (stop: [number, number]): number =>
        (stop[0] * 1e9 + stop[1]) * 1e-6;

    let successful = true;
    const ASYNC_ACTIONS = [];

    const handleError = (
        reason: unknown,
        action: Action,
        start: [number, number],
    ): void => {
        {
            const duration = timeDiffInMs(process.hrtime(start)).toFixed(2);

            const scenarioResults = RESULTS.get(scenarioName);
            if (scenarioResults)
                scenarioResults.push(
                    new TestResult(action.description, duration, false),
                );

            if (reason)
                getLogger(scenario.name).error(JSON.stringify(reason), ctx);
            getLogger(scenario.name).info(
                pad(MSG_WIDTH, ` Time: ${duration} ms ###########`, '#'),
                ctx,
            );

            // process.exit(1);
            successful = false;
        }
    };

    for (const action of scenario.actions) {
        Object.assign(ctx, { action: action.name });

        getLogger(scenarioName).info(
            pad(`#### (A): ${action.description} `, MSG_WIDTH, '#'),
            ctx,
        );
        const start = process.hrtime();

        const actionCallback = action.invoke(scenario);
        if (action.type === ActionType.WEBSOCKET) {
            ASYNC_ACTIONS.push(actionCallback);
        }

        // eslint-disable-next-line no-await-in-loop
        await actionCallback.promise
            .then(result => {
                const duration = timeDiffInMs(process.hrtime(start)).toFixed(2);

                const scenarioResults = RESULTS.get(scenarioName);
                if (scenarioResults)
                    scenarioResults.push(
                        new TestResult(action.description, duration, true),
                    );

                if (result)
                    getLogger(scenario.name).debug(JSON.stringify(result), ctx);
                getLogger(scenario.name).info(
                    pad(MSG_WIDTH, ` Time: ${duration} ms ###########`, '#'),
                    ctx,
                );
            })
            .catch(reason => handleError(reason, action, start));
        if (!successful) break;
    }

    // stop all async running actions
    ASYNC_ACTIONS.forEach(callback => {
        callback.cancel();
    });
}

function printResults(): void {
    RESULTS.forEach((result, scenario) => {
        const ctx = { scenario };
        const MSG_WIDTH = 100;

        getLogger(scenario).info(
            pad(`#### SUMMARY: ${scenario} `, MSG_WIDTH, '#'),
            ctx,
        );

        result.forEach((res: TestResult) => {
            if (res.successful)
                getLogger(scenario).info(
                    ` OK: ${pad(res.action, 50)} ${res.duration} ms`,
                    ctx,
                );
            else
                getLogger(scenario).info(
                    `NOK: ${pad(res.action, 50)} ${res.duration} ms`,
                    ctx,
                );
        });

        getLogger(scenario).info(pad(MSG_WIDTH, '#', '#'), ctx);
    });
}

async function stopProcessIfUnsuccessfulResults(): Promise<void> {
    let anyError = false;
    const diagrams = [];
    RESULTS.forEach((res, scenario) => {
        diagrams.push(generateSequenceDiagram(scenario));
        if (res.some(t => t.successful === false)) {
            anyError = true;
        }
    });
    await Promise.all(diagrams);
    if (anyError) process.exit(1);
}

export const OUTPUT_DIR = (): string => OUT_DIR;
