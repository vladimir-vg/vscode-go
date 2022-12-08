/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable node/no-unsupported-features/node-builtins */
/* eslint-disable no-async-promise-executor */
/* eslint-disable node/no-unpublished-import */
import assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as readline from 'readline';
import { tmpdir } from 'os';
import * as net from 'net';
import * as path from 'path';
import * as sinon from 'sinon';
import * as proxy from '../../src/goDebugFactory';
import * as vscode from 'vscode';
import { DebugConfiguration, DebugProtocolMessage } from 'vscode';
import { DebugClient } from 'vscode-debugadapter-testsupport';
import { ILocation } from 'vscode-debugadapter-testsupport/lib/debugClient';
import { DebugProtocol } from 'vscode-debugprotocol';
import { GoDebugConfigurationProvider, parseDebugProgramArgSync } from '../../src/goDebugConfiguration';
import { getBinPath, rmdirRecursive } from '../../src/util';
import getPort = require('get-port');
import { TimestampedLogger } from '../../src/goLogging';
import { affectedByIssue832 } from './testutils';

// For debugging test and streaming the trace instead of buffering, set this.
const PRINT_TO_CONSOLE = false;



// Test suite adapted from:
// https://github.com/microsoft/vscode-mock-debug/blob/master/src/tests/adapter.test.ts
const testAll = (ctx: Mocha.Context, isDlvDap: boolean, withConsole?: string) => {
	const debugConfigProvider = new GoDebugConfigurationProvider();
	const DEBUG_ADAPTER = path.join('.', 'out', 'src', 'debugAdapter', 'goDebug.js');

	const PROJECT_ROOT = path.normalize(path.join(__dirname, '..', '..', '..'));
	const DATA_ROOT = path.join(PROJECT_ROOT, 'test', 'testdata');

	let dc: DebugClient;
	let dlvDapAdapter: DelveDAPDebugAdapterOnSocket | null;
	let dapTraced = false;

	setup(async () => {
		dapTraced = false;

		if (isDlvDap) {
			dc = new DebugClient('dlv', 'dap', 'go');
			// dc.start will be called in initializeDebugConfig call,
			// which creates a thin adapter for delve dap mode,
			// runs it on a network port, and gets wired with this dc.

			// Launching delve may take longer than the default timeout of 5000.
			dc.defaultTimeout = 20_000;
			return;
		}

		dc = new DebugClient('node', path.join(PROJECT_ROOT, DEBUG_ADAPTER), 'go', undefined, true);
		// Launching delve may take longer than the default timeout of 5000.
		dc.defaultTimeout = 20_000;
		// To connect to a running debug server for debugging the tests, specify PORT.
		await dc.start();
	});

	teardown(async () => {
		if (dlvDapAdapter) {
			const d = dlvDapAdapter;
			dlvDapAdapter = null;
			if (ctx.currentTest?.state === 'failed') {
				console.log(`${ctx.currentTest?.title} FAILED: DAP Trace`);
				d.printLog();
			}
			d.dispose();
		} else {
			if (ctx.currentTest?.state === 'failed' && dapTraced) {
				console.log(`${ctx.currentTest?.title} FAILED: Debug Adapter Trace`);
				try {
					await new Promise<void>((resolve) => {
						const rl = readline.createInterface({
							input: fs.createReadStream(path.join(tmpdir(), 'vscode-go-debug.txt')),
							crlfDelay: Infinity
						});
						rl.on('line', (line) => console.log(line));
						rl.on('close', () => resolve());
					});
				} catch (e) {
					console.log(`Failed to read trace: ${e}`);
				}
			}
			dc?.stop();
		}
		sinon.restore();
	});

	/**
	 * Helper function to retrieve a stopped event for a breakpoint.
	 * This function will keep calling action() until we receive a stoppedEvent.
	 * Will return undefined if the result of repeatedly calling action does not
	 * induce a stoppedEvent.
	 */
	async function waitForBreakpoint(action: () => void, breakpoint: ILocation): Promise<void> {
		const assertStoppedLocation = dc.assertStoppedLocation('breakpoint', breakpoint);
		await new Promise((res) => setTimeout(res, 1_000));
		action();
		await assertStoppedLocation;
	}

	/**
	 * Helper function to create a promise that's resolved when
	 * output event with any of the provided strings is observed.
	 */
	async function waitForOutputMessage(dc: DebugClient, ...patterns: string[]): Promise<DebugProtocol.Event> {
		return await new Promise<DebugProtocol.Event>((resolve, reject) => {
			dc.on('output', (event) => {
				for (const pattern of patterns) {
					if (event.body.output.includes(pattern)) {
						// Resolve when we have found the event that we want.
						resolve(event);
						return;
					}
				}
			});
		});
	}

	/**
	 * Helper function to assert that a variable has a particular value.
	 * This should be called when the program is stopped.
	 *
	 * The following requests are issued by this function to determine the
	 * value of the variable:
	 *  1. threadsRequest
	 *  2. stackTraceRequest
	 *  3. scopesRequest
	 *  4. variablesRequest
	 */
	async function assertLocalVariableValue(name: string, val: string): Promise<void> {
		const threadsResponse = await dc.threadsRequest();
		assert(threadsResponse.success);
		const stackTraceResponse = await dc.stackTraceRequest({ threadId: threadsResponse.body.threads[0].id });
		assert(stackTraceResponse.success);
		const scopesResponse = await dc.scopesRequest({ frameId: stackTraceResponse.body.stackFrames[0].id });
		assert(scopesResponse.success);
		const localScopeIndex = scopesResponse.body.scopes.findIndex((v) => v.name === 'Local' || v.name === 'Locals');
		assert(localScopeIndex >= 0, "no scope named 'Local':");
		const variablesResponse = await dc.variablesRequest({
			variablesReference: scopesResponse.body.scopes[localScopeIndex].variablesReference
		});
		assert(variablesResponse.success);
		// Locate the variable with the matching name.
		const i = variablesResponse.body.variables.findIndex((v) => v.name === name);
		assert(i >= 0, `no variable in scope named ${name}`);
		// Check that the value of name is val.
		assert.strictEqual(variablesResponse.body.variables[i].value, val);
	}

	// The file paths returned from delve use '/' not the native path
	// separator, so we can replace any instances of '\' with '/', which
	// allows the hitBreakpoint check to match.
	const getBreakpointLocation = (FILE: string, LINE: number) => {
		return { path: FILE.replace(/\\/g, '/'), line: LINE };
	};

	suite('conditionalBreakpoints', () => {
		if (withConsole) {
			return;
		}
		test('should stop on conditional breakpoint', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'condbp');
			const FILE = path.join(DATA_ROOT, 'condbp', 'condbp.go');
			const BREAKPOINT_LINE = 7;
			const location = getBreakpointLocation(FILE, BREAKPOINT_LINE);

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([
				dc
					.waitForEvent('initialized')
					.then(() => {
						return dc.setBreakpointsRequest({
							lines: [location.line],
							breakpoints: [{ line: location.line, condition: 'i == 2' }],
							source: { path: location.path }
						});
					})
					.then(() => {
						return dc.configurationDoneRequest();
					}),
				dc.launch(debugConfig),

				dc.assertStoppedLocation('breakpoint', location)
			]).then(() =>
				// The program is stopped at the breakpoint, check to make sure 'i == 1'.
				assertLocalVariableValue('i', '2')
			);
		});

		test('should add breakpoint condition', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'condbp');
			const FILE = path.join(DATA_ROOT, 'condbp', 'condbp.go');
			const BREAKPOINT_LINE = 7;
			const location = getBreakpointLocation(FILE, BREAKPOINT_LINE);

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await dc
				.hitBreakpoint(debugConfig, location)
				.then(() =>
					// The program is stopped at the breakpoint, check to make sure 'i == 0'.
					assertLocalVariableValue('i', '0')
				)
				.then(() =>
					// Add a condition to the breakpoint, and make sure it runs until 'i == 2'.
					dc
						.setBreakpointsRequest({
							lines: [location.line],
							breakpoints: [{ line: location.line, condition: 'i == 2' }],
							source: { path: location.path }
						})
						.then(() =>
							Promise.all([
								dc.continueRequest({ threadId: 1 }),
								dc.assertStoppedLocation('breakpoint', location)
							]).then(() =>
								// The program is stopped at the breakpoint, check to make sure 'i == 2'.
								assertLocalVariableValue('i', '2')
							)
						)
				);
		});

		test('should remove breakpoint condition', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'condbp');
			const FILE = path.join(DATA_ROOT, 'condbp', 'condbp.go');
			const BREAKPOINT_LINE = 7;
			const location = getBreakpointLocation(FILE, BREAKPOINT_LINE);

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([
				dc
					.waitForEvent('initialized')
					.then(async () => {
						return dc.setBreakpointsRequest({
							lines: [location.line],
							breakpoints: [{ line: location.line, condition: 'i == 2' }],
							source: { path: location.path }
						});
					})
					.then(() => {
						return dc.configurationDoneRequest();
					}),

				dc.launch(debugConfig),

				dc.assertStoppedLocation('breakpoint', location)
			])
				.then(() =>
					// The program is stopped at the breakpoint, check to make sure 'i == 2'.
					assertLocalVariableValue('i', '2')
				)
				.then(() =>
					// Remove the breakpoint condition, and make sure the program runs until 'i == 3'.
					dc
						.setBreakpointsRequest({
							lines: [location.line],
							breakpoints: [{ line: location.line }],
							source: { path: location.path }
						})
						.then(() =>
							Promise.all([
								dc.continueRequest({ threadId: 1 }),
								dc.assertStoppedLocation('breakpoint', location)
							]).then(() =>
								// The program is stopped at the breakpoint, check to make sure 'i == 3'.
								assertLocalVariableValue('i', '3')
							)
						)
				);
		});
	});

	suite('switch goroutine', () => {
		if (withConsole) {
			return;
		}
		async function continueAndFindParkedGoroutine(file: string): Promise<number> {
			// Find a goroutine that is stopped in parked.
			const bp = getBreakpointLocation(file, 8);
			await dc.setBreakpointsRequest({ source: { path: bp.path }, breakpoints: [bp] });

			let parkedGoid = -1;
			while (parkedGoid < 0) {
				const res = await Promise.all([
					dc.continueRequest({ threadId: 1 }),
					Promise.race([
						dc.waitForEvent('stopped'),
						// It is very unlikely to happen. But in theory if all sayhi
						// goroutines are run serially, there will never be a second parked
						// sayhi goroutine when another breaks and we will keep trying
						// until process termination. If the process terminates, mark the test
						// as done.
						dc.waitForEvent('terminated')
					])
				]);
				const event = res[1];
				if (res[1].event === 'terminated') {
					break;
				}
				const threads = await dc.threadsRequest();

				// Search for a parked goroutine that we know for sure will have to be
				// resumed before the program can exit. This is a goroutine that:
				// 1. is executing main.hi
				// 2. hasn't called wg.Done yet
				// 3. is not the currently selected goroutine
				for (let i = 0; i < threads.body.threads.length; i++) {
					const g = threads.body.threads[i];
					if (g.id === event.body.threadId) {
						continue;
					}
					const st = await dc.stackTraceRequest({ threadId: g.id, startFrame: 0, levels: 5 });
					for (let j = 0; j < st.body.stackFrames.length; j++) {
						const frame = st.body.stackFrames[j];
						if (frame.name === 'main.hi') {
							parkedGoid = g.id;
							break;
						}
					}
					if (parkedGoid >= 0) {
						break;
					}
				}
			}

			// Clear all breakpoints
			await dc.setBreakpointsRequest({ source: { path: bp.path }, breakpoints: [] });
			return parkedGoid;
		}

		async function runSwitchGoroutineTest(stepFunction: string) {
			const PROGRAM = path.join(DATA_ROOT, 'goroutineTest');
			const FILE = path.join(PROGRAM, 'main.go');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				stopOnEntry: true
			};
			const debugConfig = await initializeDebugConfig(config);

			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig), dc.waitForEvent('stopped')]);

			const parkedGoid = await continueAndFindParkedGoroutine(FILE);

			// runStepFunction runs the necessary step function and resolves if it succeeded.
			async function runStepFunction(
				args: { threadId: number },
				resolve: (value: void | PromiseLike<void>) => void,
				reject: (reason?: any) => void
			) {
				const callback = (resp: any) => {
					assert.ok(resp.success);
					resolve();
				};
				switch (stepFunction) {
					case 'next':
						callback(await dc.nextRequest(args));
						break;
					case 'step in':
						callback(await dc.stepInRequest(args));
						break;
					case 'step out':
						callback(await dc.stepOutRequest(args));
						break;
					default:
						reject(new Error(`not a valid step function ${stepFunction}`));
				}
			}

			if (parkedGoid > 0) {
				// Next on the parkedGoid.
				await Promise.all([
					new Promise<void>((resolve, reject) => {
						const args = { threadId: parkedGoid };
						return runStepFunction(args, resolve, reject);
					}),
					dc.waitForEvent('stopped').then((event) => {
						assert.strictEqual(event.body.reason, 'step');
						assert.strictEqual(event.body.threadId, parkedGoid);
					})
				]);
			} else {
				console.log('Unable to find a goroutine to step.');
			}
		}

		test('next', async function () {
			if (!isDlvDap) {
				// Not implemented in the legacy adapter.
				this.skip();
			}
			await runSwitchGoroutineTest('next');
		});

		test('step in', async function () {
			if (!isDlvDap) {
				// Not implemented in the legacy adapter.
				this.skip();
			}
			await runSwitchGoroutineTest('step in');
		});

		test('step out', async function () {
			if (!isDlvDap) {
				// Not implemented in the legacy adapter.
				this.skip();
			}
			await runSwitchGoroutineTest('step in');
		});
	});

	let testNumber = 0;
	async function initializeDebugConfig(config: DebugConfiguration, keepUserLogSettings?: boolean) {
		// be explicit and prevent resolveDebugConfiguration from picking
		// a default debugAdapter for us.
		config['debugAdapter'] = isDlvDap ? 'dlv-dap' : 'legacy';
		if (withConsole) {
			config['console'] = withConsole;
		}

		if (!keepUserLogSettings) {
			dapTraced = true;

			// Log the output for easier test debugging.
			config['logOutput'] = isDlvDap ? 'dap,debugger' : 'rpc,debugger';
			config['showLog'] = true;
			config['trace'] = 'verbose';
		}

		// disable version check (like in dlv-dap).
		if (!isDlvDap) {
			const dlvFlags = config['dlvFlags'] || [];
			config['dlvFlags'] = ['--check-go-version=false'].concat(dlvFlags);
		}
		// Give each test a distinct debug binary. If a previous test
		// and a new test use the same binary location, it is possible
		// that the second test could build the binary, and then the
		// first test could delete that binary during cleanup before the
		// second test has a chance to run it.
		if (!config['output'] && ['debug', 'auto', 'test'].includes(config['mode'])) {
			const dir = parseDebugProgramArgSync(config['program']).dirname;
			config['output'] = path.join(dir, `__debug_bin_${testNumber}`);
		}
		testNumber++;

		let debugConfig: DebugConfiguration | null | undefined = await debugConfigProvider.resolveDebugConfiguration(
			undefined,
			config
		);
		debugConfig = await debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			undefined,
			debugConfig!
		);

		if (isDlvDap) {
			dlvDapAdapter = await DelveDAPDebugAdapterOnSocket.create(debugConfig!);
			const port = await dlvDapAdapter.serve();
			await dc.start(port); // This will connect to the adapter's port.
		}
		return debugConfig;
	}
};

suite('Go Debug Adapter Tests (legacy)', function () {
	if (affectedByIssue832()) {
		return;
	}
	this.timeout(60_000);
	testAll(this.ctx, false);
});

suite('Go Debug Adapter Tests (dlv-dap)', function () {
	this.timeout(60_000);
	testAll(this.ctx, true);
});

suite('Go Debug Adapter Tests (dlv-dap, console=integratedTerminal)', function () {
	this.timeout(60_000);
	testAll(this.ctx, true, 'integratedTerminal');
});

// DelveDAPDebugAdapterOnSocket runs a DelveDAPOutputAdapter
// over a network socket. This allows tests to instantiate
// the thin adapter for Delve DAP and the debug test support's
// DebugClient to communicate with the adapter over a network socket.
class DelveDAPDebugAdapterOnSocket extends proxy.DelveDAPOutputAdapter {
	static async create(config: DebugConfiguration) {
		const d = new DelveDAPDebugAdapterOnSocket(config);
		return d;
	}

	private constructor(config: DebugConfiguration) {
		super(config, new TimestampedLogger('error', undefined, PRINT_TO_CONSOLE));
	}

	private static TWO_CRLF = '\r\n\r\n';
	private _rawData?: Buffer;
	private _contentLength?: number;
	private _writableStream?: NodeJS.WritableStream;
	private _server?: net.Server;
	private _port?: number; // port for the thin adapter.

	public serve(): Promise<number | undefined> {
		return new Promise(async (resolve, reject) => {
			this._port = await getPort();
			this._server = net.createServer((c) => {
				this.log('>> accepted connection from client');
				c.on('end', () => {
					this.log('>> client disconnected');
					this.dispose();
				});
				this.run(c, c);
			});
			this._server.on('error', (err) => reject(err));
			this._server.listen(this._port, () => resolve(this._port));
		});
	}

	private run(inStream: NodeJS.ReadableStream, outStream: NodeJS.WritableStream): void {
		this._writableStream = outStream;
		this._rawData = Buffer.alloc(0);

		// forward to DelveDAPDebugAdapter, which will forward to dlv dap.
		inStream.on('data', (data: Buffer) => this._handleData(data));
		// DebugClient silently drops reverse requests. Handle runInTerminal request here.
		this.onDidSendMessage((m) => {
			if (this.handleRunInTerminal(m)) {
				return;
			}
			this._send(m);
		});

		inStream.resume();
	}

	// handleRunInTerminal spawns the requested command and simulates RunInTerminal
	// handler implementation inside an editor.
	private _dlvInTerminal: cp.ChildProcess | undefined;
	private handleRunInTerminal(m: vscode.DebugProtocolMessage) {
		const m0 = m as any;
		if (m0['type'] !== 'request' || m0['command'] !== 'runInTerminal') {
			return false;
		}
		const json = JSON.stringify(m0);
		this.log(`<- server: ${json}`);

		const resp = {
			seq: 0,
			type: 'response',
			success: false,
			request_seq: m0['seq'],
			command: m0['command'],
			body: {}
		};

		if (!this._dlvInTerminal && m0['arguments']?.args?.length > 0) {
			const args = m0['arguments'].args as string[];
			const env = m0['arguments'].env ? Object.assign({}, process.env, m0['arguments'].env) : undefined;
			const p = cp.spawn(args[0], args.slice(1), {
				cwd: m0['arguments'].cwd,
				env
			});
			// stdout/stderr are supposed to appear in the terminal, but
			// some of noDebug tests depend on access to stdout/stderr.
			// For those tests, let's pump the output as OutputEvent.
			p.stdout.on('data', (chunk) => {
				this.outputEvent('stdout', chunk.toString());
			});
			p.stderr.on('data', (chunk) => {
				this.outputEvent('stderr', chunk.toString());
			});
			resp.success = true;
			resp.body = { processId: p.pid };
			this._dlvInTerminal = p;
		}

		this.log(`-> server: ${JSON.stringify(resp)}`);
		this.handleMessage(resp);

		return true;
	}

	private _disposed = false;
	public async dispose(timeoutMS?: number) {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this.log('adapter disposing');
		await this._server?.close();
		await super.dispose(timeoutMS);
		this.log('adapter disposed');
	}

	// Code from
	// https://github.com/microsoft/vscode-debugadapter-node/blob/2235a2227d1a439372be578cd3f55e15211851b7/testSupport/src/protocolClient.ts#L96-L97
	private _send(message: DebugProtocolMessage): void {
		if (this._writableStream) {
			const json = JSON.stringify(message);
			this.log(`<- server: ${json}`);
			if (!this._writableStream.writable) {
				this.log('socket closed already');
				return;
			}
			this._writableStream.write(
				`Content-Length: ${Buffer.byteLength(json, 'utf8')}${DelveDAPDebugAdapterOnSocket.TWO_CRLF}${json}`,
				'utf8'
			);
		}
	}

	// Code from
	// https://github.com/microsoft/vscode-debugadapter-node/blob/2235a2227d1a439372be578cd3f55e15211851b7/testSupport/src/protocolClient.ts#L100-L132
	private _handleData(data: Buffer): void {
		this._rawData = Buffer.concat([this._rawData!, data]);

		// eslint-disable-next-line no-constant-condition
		while (true) {
			if (this._contentLength! >= 0) {
				if (this._rawData.length >= this._contentLength!) {
					const message = this._rawData.toString('utf8', 0, this._contentLength);
					this._rawData = this._rawData.slice(this._contentLength);
					this._contentLength = -1;
					if (message.length > 0) {
						try {
							this.log(`-> server: ${message}`);
							const msg: DebugProtocol.ProtocolMessage = JSON.parse(message);
							this.handleMessage(msg);
						} catch (e) {
							throw new Error('Error handling data: ' + (e && (e as Error).message));
						}
					}
					continue; // there may be more complete messages to process
				}
			} else {
				const idx = this._rawData.indexOf(DelveDAPDebugAdapterOnSocket.TWO_CRLF);
				if (idx !== -1) {
					const header = this._rawData.toString('utf8', 0, idx);
					const lines = header.split('\r\n');
					for (let i = 0; i < lines.length; i++) {
						const pair = lines[i].split(/: +/);
						if (pair[0] === 'Content-Length') {
							this._contentLength = +pair[1];
						}
					}
					this._rawData = this._rawData.slice(idx + DelveDAPDebugAdapterOnSocket.TWO_CRLF.length);
					continue;
				}
			}
			break;
		}
	}
	/* --- accumulate log messages so we can output when the test fails --- */
	private _log = [] as string[];
	private log(msg: string) {
		this._log.push(msg);
		if (PRINT_TO_CONSOLE) {
			console.log(msg);
		}
	}
	public printLog() {
		this._log.forEach((msg) => console.log(msg));
	}
}

