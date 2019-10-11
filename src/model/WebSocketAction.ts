import { stringify } from 'querystring';
import { runInNewContext } from 'vm';
import * as WebSocket from 'ws';
import { addWsMessage } from '../diagramDrawing';
import { getLogger } from '../logging';
import {
    injectEvalAndVarsToMap,
    injectEvalAndVarsToString,
} from '../variableInjection';
import { Action } from './Action';
import { ActionCallback } from './ActionCallback';
import { ActionType } from './ActionType';
import { Scenario } from './Scenario';

const MAX_RECONNECTIONS = 3;

class WebSocketAction implements Action {
    public name: string;

    public description: string;

    public type = ActionType.WEBSOCKET;

    public invokeEvenOnFail = false;

    public allowFailure = false;

    private reconnected = 0;

    private serviceName: string;

    private url: string;

    private headers: any;

    private data: any;

    private expectedNumberOfMessages: number;

    private messageFilter: string[];

    private receivedMessages: Set<string>;

    private wsInstance: WebSocket;

    public constructor(
        name: string,
        desc = name,
        wsDefinition: any,
        serviceName: string,
        url = wsDefinition.url,
        headers = wsDefinition.headers,
        data = wsDefinition.data,
        expectedNumberOfMessages = wsDefinition.expectedNumberOfMessages,
        messageFilter = wsDefinition.messageFilter,
        invokeEvenOnFail = wsDefinition.invokeEvenOnFail,
        allowFailure = wsDefinition.allowFailure,
    ) {
        this.name = name;
        this.serviceName = serviceName;
        this.url = url;
        this.headers = headers;
        this.data = data;
        this.expectedNumberOfMessages = expectedNumberOfMessages;
        this.messageFilter = messageFilter;
        this.description = desc;
        this.invokeEvenOnFail = invokeEvenOnFail;
        this.allowFailure = allowFailure;

        this.receivedMessages = new Set<string>();
    }

    public static fromTemplate(
        wsDefinition: any,
        template: WebSocketAction,
    ): WebSocketAction {
        return new WebSocketAction(
            template.name,
            wsDefinition.description || wsDefinition.name,
            wsDefinition,
            template.serviceName,
            template.url,
            template.headers
                ? Object.assign(
                      Object.assign({}, template.headers),
                      wsDefinition.headers,
                  )
                : wsDefinition.restHead,
            this.loadData(template, wsDefinition),
            wsDefinition.expectedNumberOfMessages ||
                template.expectedNumberOfMessages,
            wsDefinition.invokeEvenOnFail || template.invokeEvenOnFail,
            wsDefinition.allowFailure || template.allowFailure,
        );
    }

    private static loadData(template: WebSocketAction, actionDef: any): any {
        if (template.data) {
            if (Array.isArray(template.data))
                return template.data.concat(actionDef.data || []);
            return Object.assign(
                Object.assign({}, template.data),
                actionDef.data,
            );
        }
        return actionDef.data;
    }

    public invoke(scenario: Scenario): ActionCallback {
        const promise = new Promise((resolve, reject) => {
            this.invokeAsync(scenario, resolve, reject);
        });

        return {
            promise,
            cancel: () => this.wsInstance.close(),
        };
    }

    private invokeAsync(
        scenario: Scenario,
        resolve: (value?: unknown) => void,
        reject: (reason?: unknown) => void,
    ): void {
        const ctx = { scenario: scenario.name, action: this.name };
        const resolvedUrl = injectEvalAndVarsToString(
            this.url,
            scenario.cache,
            ctx,
        );
        const queryParams = injectEvalAndVarsToMap(
            this.headers,
            scenario.cache,
            ctx,
        );
        const registeredMessageFilters = this.messageFilter;

        const logDebug = (debugMessage: string): void => {
            getLogger(scenario.name).debug(debugMessage, ctx);
        };

        const logError = (errorMessage: string): void => {
            getLogger(scenario.name).error(errorMessage, ctx);
        };

        const isMessageRelevant = (msg: unknown): boolean => {
            if (registeredMessageFilters) {
                return registeredMessageFilters.some((filter): boolean => {
                    const expandedFilter = injectEvalAndVarsToString(
                        filter,
                        scenario.cache,
                        ctx,
                    ).toString();
                    const filterResult = !!runInNewContext(expandedFilter, {
                        msg,
                    });
                    logDebug(`Filter (${expandedFilter}): ${filterResult}`);
                    return filterResult;
                });
            }
            return true;
        };

        this.wsInstance = new WebSocket(
            `${resolvedUrl}?${stringify(queryParams)}`,
        );

        this.wsInstance.on('open', () => {
            logDebug(`WebSocket to ${resolvedUrl} successfully opened!`);

            if (this.data && this.reconnected === 0) {
                const payload = JSON.stringify(this.data);
                this.wsInstance.send(payload);
                logDebug(`WS message sent: ${payload}`);
            }
        });

        this.wsInstance.on('message', data => {
            const parsedMessage = JSON.parse(data.toString());
            if (isMessageRelevant(parsedMessage)) {
                this.receivedMessages.add(data.toString());
                logDebug(
                    `Relevant WS message received (${this.receivedMessages.size}/${this.expectedNumberOfMessages}): ${data}`,
                );
                addWsMessage(scenario.name, this.serviceName, parsedMessage);
            }
        });

        this.wsInstance.on('close', closeCode => {
            if (closeCode === 1006 && this.reconnected <= MAX_RECONNECTIONS) {
                logDebug('reconnecting...');
                this.reconnected++;
                this.invokeAsync(scenario, resolve, reject);
            } else {
                logDebug(`Successfully closed WS connection: ${closeCode}`);
                if (
                    this.receivedMessages.size !== this.expectedNumberOfMessages
                ) {
                    logError(
                        `Unexpected number of messages retrieved: ${this.receivedMessages.size} (expected: ${this.expectedNumberOfMessages})`,
                    );
                    reject();
                } else {
                    resolve();
                }
            }
        });

        this.wsInstance.on('error', err => {
            logError(`${err}`);
            reject();
        });
    }
}

export { WebSocketAction };
