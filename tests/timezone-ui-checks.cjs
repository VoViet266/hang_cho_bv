// Run with Node.js, including under a host TZ other than Asia/Ho_Chi_Minh.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
let currentTime = "2026-10-15T16:59:59Z";
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [currentTime])); }
  static now() { return new Date(currentTime).valueOf(); }
}
function check(name, run) {
  run();
  console.log("PASS " + name);
}
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }

const clockFiles = [
  "Views/View/Index.cshtml", "Views/View/KhamBenhIndex.cshtml",
  "Views/View/CdhaIndex.cshtml", "Views/View/DuocIndex.cshtml",
  "Views/View/DuocNhap.cshtml", "Views/View/DuocRoom.cshtml",
  "wwwroot/js/displayBoard.js", "wwwroot/js/multiBoard.js"
];
currentTime = "2026-10-15T17:00:00Z";
for (const file of clockFiles) {
  check(file + " displays Vietnam midnight and the correct date", () => {
    const clock = read(file).match(/(function updateTime\(\)\s*\{[\s\S]*?\})\s*setInterval\(updateTime/);
    assert.ok(clock, "Clock function exists");
    const elements = { "date-str": {}, "time-str": {} };
    vm.runInNewContext(clock[1] + "; updateTime();", {
      Date: FixedDate, document: { getElementById: (id) => elements[id] },
      $id: (id) => elements[id]
    });
    assert.match(elements["date-str"].textContent, /16\/10/);
    assert.equal(elements["time-str"].textContent, "00:00:00");
  });
}

check("Hidden patient storage rolls over at Vietnam midnight", () => {
  currentTime = "2026-10-15T16:59:59Z";
  const values = new Map();
  const context = {
    Date: FixedDate, Intl, window: {}, console,
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    }
  };
  vm.runInNewContext(read("wwwroot/js/queuePolicy.js"), context);
  const policy = context.window.QueuePolicy;
  policy.hide("EXAM", "Test");
  assert.equal(values.get("queue_hidden_patients_date"), "2026-10-15");
  assert.equal(policy.getHiddenList()[0].time, "23:59");
  currentTime = "2026-10-15T17:00:00Z";
  assert.equal(policy.getHiddenList().length, 0);
  assert.equal(values.get("queue_hidden_patients_date"), "2026-10-16");
});

for (const file of ["wwwroot/js/socket-signalr-adapter.js", "Views/View/DuocRoom.cshtml"]) {
  check(file + " schedules overnight refresh at 04:30 Vietnam time", () => {
    const code = read(file);
    const clockExpression = code.match(/now\.toLocaleTimeString\('en-GB', \{[^}]+\}\) === '04:30'/);
    assert.ok(clockExpression);
    assert.equal(vm.runInNewContext(clockExpression[0], { now: new Date("2026-10-15T21:30:00Z") }), true);
    assert.equal(vm.runInNewContext(clockExpression[0], { now: new Date("2026-10-15T04:30:00Z") }), false);
  });
}

// Compile every external application script to catch syntax errors.
for (const file of fs.readdirSync(path.join(root, "wwwroot/js"))) {
  if (!file.endsWith(".js")) continue;
  new vm.Script(read("wwwroot/js/" + file), { filename: file });
}
console.log("PASS All external JavaScript files parse");
