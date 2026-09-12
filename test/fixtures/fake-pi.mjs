#!/usr/bin/env node
/**
 * A stand-in for `pi --mode rpc`: JSON lines in, JSON lines out.
 * Behaviour is picked with FAKE_PI_MODE so lifecycle tests can drive the real PiProcess:
 *   normal            answer every request with success
 *   silent            never answer (hung binary)
 *   crash-on-request  exit(3) as soon as the first line arrives (dies mid-request)
 *   exit-immediately  exit(2) before reading anything (early crash, stderr explains)
 */
const mode = process.env.FAKE_PI_MODE || "normal";
if (mode === "exit-immediately") {
  process.stderr.write("fake pi: refusing to start\n");
  process.exit(2);
}
process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i = buf.indexOf("\n");
  while (i >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (line.trim()) onLine(JSON.parse(line));
    i = buf.indexOf("\n");
  }
});
function onLine(cmd) {
  if (mode === "crash-on-request") process.exit(3);
  if (mode === "silent") return;
  if (cmd.type === "get_state") {
    const data = {
      model: null,
      thinkingLevel: "off",
      isStreaming: false,
      isCompacting: false,
      steeringMode: "one-at-a-time",
      followUpMode: "one-at-a-time",
      sessionFile: null,
      sessionId: "fake",
      sessionName: null,
      autoCompactionEnabled: false,
      autoRetryEnabled: false,
      messageCount: 0,
      pendingMessageCount: 0,
    };
    write({ id: cmd.id, type: "response", command: "get_state", success: true, data });
    return;
  }
  write({ id: cmd.id, type: "response", command: cmd.type, success: true });
}
function write(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}
