import vscode = require('vscode');

export class VisTreeProvider implements vscode.WebviewViewProvider {
	static setup(ctx: vscode.ExtensionContext) {
		const provider = new this(ctx.extensionUri);
		ctx.subscriptions.push(
			vscode.window.registerWebviewViewProvider('go.visTree', provider),
		);
		return provider;
	}

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;
		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<title>Goroutine Tree View</title>
				<style>
.App {
  /* text-align: center; */
  display: flex;
}

.App-logo {
  height: 40vmin;
  pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
  .App-logo {
    animation: App-logo-spin infinite 20s linear;
  }
}

body {
  background: #181818;
}

svg {
  background: #181818;
}

.App-header {
  background-color: #282c34;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: calc(10px + 2vmin);
  color: white;
}

.App-link {
  color: #61dafb;
}

@keyframes App-logo-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}



.GoroutineBody-header {
  fill: #C687C1;
}
.GoroutineBody-main {
  fill: #3A3A3A;
}
.GoroutineBody-header:hover {
  fill: blue;
  cursor: pointer;
}
.GoroutineBody.selected .GoroutineBody-header {
  fill: darkblue;
}


.SpawnLine-line {
  stroke: #C687C1;
}
.SpawnLine-outline {
  fill: #181818;
}
.SpawnLine-parentPoint {
  /* fill: grey; */
  fill: #C687C1;
}
.SpawnLine:hover {
  cursor: pointer;
}
.SpawnLine:hover .SpawnLine-line {
  stroke: blue;
}
.SpawnLine:hover .SpawnLine-parentPoint {
  fill: blue;
}
.SpawnLine.selected .SpawnLine-line {
  stroke: darkblue;
}
.SpawnLine.selected .SpawnLine-parentPoint {
  fill: darkblue;
}

.RecvEvent line {
  stroke: #1674F8;
  fill: #1674F8;
}
.SendEvent line {
  stroke: #1674F8;
  fill: #1674F8;
}
</style>
			</head>
			<body>
				<svg width="500" height="500" style="background: ;"><defs><marker id="arrowhead" markerWidth="5" markerHeight="3.5" refX="0" refY="1.75" orient="auto"><polygon points="0 0, 5 1.75, 0 3.5" fill="#1674F8"></polygon></marker></defs><g class="GoroutineBody"><rect class="GoroutineBody-main" x="55" y="14" width="15" height="389"></rect><rect class="GoroutineBody-header" x="55" y="14" width="15" height="11"></rect></g><g class="GoroutineBody"><rect class="GoroutineBody-main" x="110" y="56" width="15" height="487"></rect><rect class="GoroutineBody-header" x="110" y="56" width="15" height="11"></rect></g><g class="GoroutineBody"><rect class="GoroutineBody-main" x="165" y="126" width="15" height="459"></rect><rect class="GoroutineBody-header" x="165" y="126" width="15" height="11"></rect></g><g class="GoroutineBody"><rect class="GoroutineBody-main" x="220" y="252" width="15" height="277"></rect><rect class="GoroutineBody-header" x="220" y="252" width="15" height="11"></rect></g><g class="GoroutineBody"><rect class="GoroutineBody-main" x="275" y="420" width="15" height="151"></rect><rect class="GoroutineBody-header" x="275" y="420" width="15" height="11"></rect></g><g class="SpawnLine"><circle class="SpawnLine-parentPoint" cx="62.5" cy="33.5" r="3"></circle><rect class="SpawnLine-outline" x="70" y="30.5" width="47.5" height="6"></rect><rect class="SpawnLine-outline" x="114.5" y="30.5" width="6" height="25"></rect><line class="SpawnLine-line" style="stroke-width: 1px;" x1="62.5" y1="33.5" x2="117.5" y2="33.5"></line><line class="SpawnLine-line" style="stroke-width: 1px;" x1="117.5" y1="33.5" x2="117.5" y2="56"></line></g><g class="SpawnLine"><circle class="SpawnLine-parentPoint" cx="62.5" cy="103.5" r="3"></circle><rect class="SpawnLine-outline" x="70" y="100.5" width="102.5" height="6"></rect><rect class="SpawnLine-outline" x="169.5" y="100.5" width="6" height="25"></rect><line class="SpawnLine-line" style="stroke-width: 1px;" x1="62.5" y1="103.5" x2="172.5" y2="103.5"></line><line class="SpawnLine-line" style="stroke-width: 1px;" x1="172.5" y1="103.5" x2="172.5" y2="126"></line></g><g class="SpawnLine"><circle class="SpawnLine-parentPoint" cx="62.5" cy="201.5" r="3"></circle><rect class="SpawnLine-outline" x="70" y="198.5" width="157.5" height="6"></rect><rect class="SpawnLine-outline" x="224.5" y="198.5" width="6" height="53"></rect><line class="SpawnLine-line" style="stroke-width: 1px;" x1="62.5" y1="201.5" x2="227.5" y2="201.5"></line><line class="SpawnLine-line" style="stroke-width: 1px;" x1="227.5" y1="201.5" x2="227.5" y2="252"></line></g><g class="SpawnLine"><circle class="SpawnLine-parentPoint" cx="62.5" cy="369.5" r="3"></circle><rect class="SpawnLine-outline" x="70" y="366.5" width="212.5" height="6"></rect><rect class="SpawnLine-outline" x="279.5" y="366.5" width="6" height="53"></rect><line class="SpawnLine-line" style="stroke-width: 1px;" x1="62.5" y1="369.5" x2="282.5" y2="369.5"></line><line class="SpawnLine-line" style="stroke-width: 1px;" x1="282.5" y1="369.5" x2="282.5" y2="420"></line></g><g class="RecvEvent"><line x1="47.5" y1="42" x2="55" y2="47.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="47.5" y1="112" x2="55" y2="117.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="157.5" y1="140" x2="165" y2="145.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="157.5" y1="182" x2="165" y2="187.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="157.5" y1="210" x2="165" y2="215.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="47.5" y1="224" x2="55" y2="229.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="212.5" y1="294" x2="220" y2="299.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="157.5" y1="322" x2="165" y2="327.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="212.5" y1="336" x2="220" y2="341.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="47.5" y1="350" x2="55" y2="355.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="47.5" y1="392" x2="55" y2="397.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="267.5" y1="448" x2="275" y2="453.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="157.5" y1="462" x2="165" y2="467.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="157.5" y1="476" x2="165" y2="481.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="212.5" y1="518" x2="220" y2="523.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="RecvEvent"><line x1="267.5" y1="560" x2="275" y2="565.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="117.5" y1="75.5" x2="125" y2="75.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="117.5" y1="89.5" x2="125" y2="89.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="172.5" y1="159.5" x2="180" y2="159.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="117.5" y1="173.5" x2="125" y2="173.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="117.5" y1="243.5" x2="125" y2="243.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="117.5" y1="271.5" x2="125" y2="271.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="172.5" y1="285.5" x2="180" y2="285.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="227.5" y1="313.5" x2="235" y2="313.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="117.5" y1="383.5" x2="125" y2="383.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="117.5" y1="411.5" x2="125" y2="411.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="172.5" y1="439.5" x2="180" y2="439.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="227.5" y1="495.5" x2="235" y2="495.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="117.5" y1="509.5" x2="125" y2="509.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="117.5" y1="537.5" x2="125" y2="537.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="282.5" y1="551.5" x2="290" y2="551.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g><g class="SendEvent"><line x1="172.5" y1="579.5" x2="180" y2="579.5" stroke="#000" stroke-width="2" marker-end="url(#arrowhead)"></line></g></svg>
			</body>
			</html>`;
	}
};