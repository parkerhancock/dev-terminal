import * as pty from "node-pty";

console.log("TTY check:", process.stdout.isTTY);

try {
  const p = pty.spawn("bash", ["-c", "echo hello from pty; sleep 0.5"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
  });

  console.log("Spawned PID:", p.pid);

  p.onData((d) => process.stdout.write(d));
  p.onExit(({ exitCode }) => {
    console.log("\nPTY exited with code:", exitCode);
    process.exit(0);
  });
} catch (err) {
  console.error("Failed to spawn:", err);
  process.exit(1);
}
