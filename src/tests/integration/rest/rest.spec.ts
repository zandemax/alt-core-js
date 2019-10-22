import 'mocha';
import {
    createServer as createHTTPServer,
    IncomingMessage,
    RequestListener,
    Server as HTTPServer,
    ServerResponse,
} from 'http';
import {
    createServer as createHTTPSServer,
    Server as HTTPSServer,
} from 'https';

import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

import { TLSSocket } from 'tls';
import { runMultipleScenariosWithConfigAsync } from '../../../index';

describe('Rest Action', () => {
    const integrationTestBasePath = 'src/tests/integration/rest/resources/';
    const actionDir = `${integrationTestBasePath}actions`;
    const outDir = './out';
    const envConfigDir = `${integrationTestBasePath}environment`;
    const environment = 'config';

    describe('Requests', () => {
        let server: HTTPServer | undefined;

        before(() => {
            const port = 8080;

            const requestHandler = (
                request: IncomingMessage,
                response: ServerResponse,
            ) => {
                response.setHeader('Content-Type', 'application/json');
                const responseBody = { code: 200 };
                response.end(JSON.stringify(responseBody));
            };

            server = createHTTPServer(requestHandler);
            server.listen(port);
        });

        after(() => {
            server && server.close();
        });

        it('should successfully perform s1', async () => {
            const scenarioPath = `${integrationTestBasePath}scenarios/s1-restExpectingJsonResponseToBeValid.yaml`;

            const result = await runMultipleScenariosWithConfigAsync(
                actionDir,
                outDir,
                envConfigDir,
                {
                    numberOfScenariosRunInParallel: 1,
                    environmentNameToBeUsed: environment,
                    drawDiagrams: false,
                },
                [scenarioPath],
            );

            expect(result).to.be.equal(true);
        });

        it('should fail perform s2', async () => {
            const scenarioPath = `${integrationTestBasePath}scenarios/s2-restExpectingJsonResponseNotToBeValid.yaml`;

            const result = await runMultipleScenariosWithConfigAsync(
                actionDir,
                outDir,
                envConfigDir,
                {
                    numberOfScenariosRunInParallel: 1,
                    environmentNameToBeUsed: environment,
                    drawDiagrams: false,
                },
                [scenarioPath],
            );

            expect(result).to.be.equal(false);
        });
    });

    describe('Requests with Client Certificate', () => {
        let server: HTTPSServer | undefined;

        before(() => {
            const port = 8080;

            type SecuredIncomingMessage = IncomingMessage & {
                client: TLSSocket;
            };

            const requestHandler: RequestListener = (
                request: SecuredIncomingMessage,
                response: ServerResponse,
            ) => {
                response.writeHead(request.client.authorized ? 200 : 401);
                response.end();
            };
            const serverOptions = {
                key: fs.readFileSync(
                    path.join(__dirname, 'resources/certs/server_key.pem'),
                    'utf-8',
                ),
                cert: fs.readFileSync(
                    path.join(__dirname, 'resources/certs/server_cert.pem'),
                    'utf-8',
                ),
                ca: fs.readFileSync(
                    path.join(__dirname, 'resources/certs/server_cert.pem'),
                    'utf-8',
                ),
                requestCert: true,
                rejectUnauthorized: false,
            };

            server = createHTTPSServer(serverOptions, requestHandler);
            server.listen(port);
        });

        after(() => {
            server && server.close();
        });

        it('should successfully perform s3', async () => {
            const scenarioPath = `${integrationTestBasePath}scenarios/s3-restExpectingClientToBeAuthorized.yaml`;

            const result = await runMultipleScenariosWithConfigAsync(
                actionDir,
                outDir,
                envConfigDir,
                {
                    numberOfScenariosRunInParallel: 1,
                    environmentNameToBeUsed: environment,
                    drawDiagrams: false,
                },
                [scenarioPath],
            );

            expect(result).to.be.equal(true);
        });

        it('should successfully perform s4', async () => {
            const scenarioPath = `${integrationTestBasePath}scenarios/s4-restExpectingClientToBeUnauthorized.yaml`;

            const result = await runMultipleScenariosWithConfigAsync(
                actionDir,
                outDir,
                envConfigDir,
                {
                    numberOfScenariosRunInParallel: 1,
                    environmentNameToBeUsed: environment,
                    drawDiagrams: false,
                },
                [scenarioPath],
            );

            expect(result).to.be.equal(false);
        });
    });
});
