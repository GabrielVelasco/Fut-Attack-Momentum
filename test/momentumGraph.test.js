const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");

const modulePromise = import(`data:text/javascript;base64,${readFileSync(require.resolve("../scripts/momentumGraph.js")).toString("base64")}`);

test("keeps missing minutes and added time in their own chronological slices", async () => {
    const { buildMomentumTimeline, formatMomentumMinute } = await modulePromise;
    const graph = buildMomentumTimeline({
        graphPoints: [
            { minute: 46, value: -61 }, { minute: 45.02, value: 7 },
            { minute: 1, value: 2 }, { minute: 45.01, value: -30 },
            { minute: 74, value: 0 }, { minute: 90.01, value: 14 }
        ], periodTime: 45, periodCount: 2, overtimeLength: 15
    });
    assert.equal(graph.slots.length, 93);
    assert.deepEqual(graph.slots.slice(44, 48), [
        { minute: 45, value: null }, { minute: 45.01, value: -30 },
        { minute: 45.02, value: 7 }, { minute: 46, value: -61 }
    ]);
    assert.equal(graph.slots.find((slot) => slot.minute === 74).value, 0);
    assert.equal(graph.scale, 61);
    assert.equal(graph.pointCount, 6);
    assert.equal(formatMomentumMinute(45.01), "45+1");
    assert.equal(formatMomentumMinute(90.12), "90+12");
    assert.equal(graph.ticks.at(-1).position, 100);
});

test("extends extra time without treating regulation stoppage as extra time", async () => {
    const { buildMomentumTimeline } = await modulePromise;
    for (const [minute, endMinute] of [[90.12, 90], [91, 105], [105.02, 105], [106, 120], [120.03, 120]]) {
        const graph = buildMomentumTimeline({ graphPoints: [{ minute, value: -98 }] });
        assert.equal(Math.floor(graph.slots.at(-1).minute), endMinute);
        assert.equal(graph.ticks.at(-1).label, `${endMinute}′`);
    }
});

test("handles unavailable, zero and invalid samples without invalid bar heights", async () => {
    const { buildMomentumTimeline } = await modulePromise;
    const empty = buildMomentumTimeline({ graphPoints: [] });
    assert.equal(empty.slots.length, 90);
    assert.equal(empty.pointCount, 0);
    assert.equal(empty.scale, 1);
    const graph = buildMomentumTimeline({ graphPoints: [
        { minute: 1, value: 0 }, { minute: 2, value: Infinity },
        { minute: NaN, value: 1 }, { minute: -1, value: 10 }, null
    ] });
    assert.equal(graph.pointCount, 1);
    assert.equal(graph.scale, 1);
    assert.throws(() => buildMomentumTimeline({}), /Invalid momentum response/);
});
