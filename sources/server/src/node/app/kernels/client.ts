/*
 * Copyright 2014 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions and limitations under
 * the License.
 */


/// <reference path="../../../../../../externs/ts/node/node.d.ts" />
/// <reference path="../../../../../../externs/ts/node/node-uuid.d.ts" />
import uuid = require('node-uuid');
import childproc = require('child_process');
import util = require('util');
import iopub = require('./iopub');
import shell = require('./shell');
import helpers = require('../common/util');

/**
 * Client for communication via the IPython protocol to a kernel process.
 */
export class KernelClient implements app.IKernel {

  static connectionUrl: string = 'tcp://127.0.0.1:';
  id: string;
  config: app.KernelConfig;

  _kernelProcess: childproc.ChildProcess;
  _iopub: iopub.IOPubChannelClient;
  _shell: shell.ShellChannelClient;
  _delegateKernelStatusHandler: app.EventHandler<app.KernelStatus>;

  constructor (id: string, config: app.KernelConfig) {
    this.id = id;
    this.config = config;
    this._iopub = new iopub.IOPubChannelClient(KernelClient.connectionUrl, config.iopubPort);
    this._shell = new shell.ShellChannelClient(KernelClient.connectionUrl, config.shellPort, id);
    this._delegateKernelStatusHandler = helpers.noop;
  }

  /**
   * Sends an execute request to the connected kernel
   */
  execute (request: app.ExecuteRequest): void {
    this._shell.execute(request);
  }

  /**
   * Registers a callback to be invoked when an execute reply message arrives from the kernel
   */
  onExecuteReply (callback: app.EventHandler<app.ExecuteReply>): void {
    this._shell.onExecuteReply(callback);
  }

  /**
   * Registers a callback to be invoked when a kernel status message arrives from the kernel
   */
  onKernelStatus (callback: app.EventHandler<app.KernelStatus>): void {
    // Keep a direct reference to the kernel status callback so that the kernel client itself is
    // can route its own kernel status messages (e.g., kernel died) to the given callback/handler
    this._delegateKernelStatusHandler = callback;
    this._iopub.onKernelStatus(callback);
  }

  onOutputData (callback: app.EventHandler<app.OutputData>): void {
    this._iopub.onOutputData(callback);
  }

  /**
   * Closes socket connections to the kernel process and then kills the kernel process
   */
  shutdown (): void {
    this._iopub.disconnect();
    this._shell.disconnect();
    this._kernelProcess.kill();
  }

  /**
   * Spawns a new kernel process and registers event handlers for per-channel kernel messages
   */
  start (): void {
    this._spawnLocalKernelProcess();
    this._iopub.connect();
    this._shell.connect();
  }

  _handleKernelDiedEvent () {
    this._delegateKernelStatusHandler ({status: 'dead', requestId: null});
  }

  _spawnLocalKernelProcess (): void {
    // Note: disabling HMAC digest via the Session.key flag for now
    var cmd = 'ipython'
    var args = [
        'kernel',
        '--Session.key=""',
        '--iopub=' + this.config.iopubPort,
        '--shell=' + this.config.shellPort,
        '--log-level="DEBUG"'
        ];
    this._kernelProcess = childproc.spawn(cmd, args);
    // For now, consider both disconnected and exitted kernels as "dead"
    this._kernelProcess.on('exit', this._handleKernelDiedEvent.bind(this));
    this._kernelProcess.on('disconnect', this._handleKernelDiedEvent.bind(this));
  }

}
