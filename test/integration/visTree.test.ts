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




const testAll = (ctx: Mocha.Context, withConsole?: string) => {
	suite('visTree', () => {
		test('trace goroutine spawns', async () => {
			console.log("Run visTree tests");
		});
	});
};

suite('Go Debug Adapter Tests (dlv-dap)', function () {
	this.timeout(60_000);
	testAll(this.ctx);
});

suite('Go Debug Adapter Tests (dlv-dap, console=integratedTerminal)', function () {
	this.timeout(60_000);
	testAll(this.ctx, 'integratedTerminal');
});
