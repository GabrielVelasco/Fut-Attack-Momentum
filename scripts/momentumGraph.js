// SofaScore encodes added-time minutes as 45.01, 45.02, 90.01, etc.
export function formatMomentumMinute(minute) {
    const whole = Math.floor(minute);
    const added = Math.round((minute - whole) * 100);
    return added ? `${whole}+${added}` : String(whole);
}

export function buildMomentumTimeline(data) {
    if (!Array.isArray(data?.graphPoints)) throw new Error("Invalid momentum response");
    const points = new Map();
    for (const point of data.graphPoints) {
        if (Number.isFinite(point?.minute) && point.minute > 0 &&
            Number.isFinite(point.value)) points.set(point.minute, point.value);
    }

    // Keep a full regulation timeline even for a match that has just started.
    // Extra time extends the timeline as soon as points beyond regulation arrive.
    const periodTime = Number.isFinite(data.periodTime) && data.periodTime > 0 ? data.periodTime : 45;
    const periodCount = Number.isInteger(data.periodCount) && data.periodCount > 0 ? data.periodCount : 2;
    const regulation = Math.ceil(periodTime * periodCount);
    const overtime = Number.isFinite(data.overtimeLength) && data.overtimeLength > 0 ? data.overtimeLength : 15;
    const lastMinute = Math.max(0, ...points.keys());
    const endMinute = lastMinute > regulation + 0.99
        ? regulation + Math.ceil((Math.floor(lastMinute) - regulation) / overtime) * overtime
        : regulation;
    const minutes = new Set(points.keys());
    for (let minute = 1; minute <= endMinute; minute += 1) minutes.add(minute);
    const slots = [...minutes].sort((a, b) => a - b).map((minute) => ({ minute, value: points.get(minute) ?? null }));
    const scale = Math.max(1, ...[...points.values()].map(Math.abs));
    const tickMinutes = new Set([periodTime, regulation, endMinute]);
    if (endMinute > regulation) {
        for (let minute = regulation + overtime; minute <= endMinute; minute += overtime) tickMinutes.add(minute);
    }
    const ticks = [{ label: '0′', position: 0 }];
    for (const minute of [...tickMinutes].sort((a, b) => a - b)) {
        const index = slots.findLastIndex((slot) => Math.floor(slot.minute) <= minute);
        ticks.push({ label: `${minute}′`, position: (index + 1) / slots.length * 100 });
    }
    return { slots, scale, ticks, pointCount: points.size };
}

export function createMomentumGraph() {
    const graph = document.createElement("div");
    graph.className = "graph-frame momentum-graph";
    graph.innerHTML = `
        <div class="momentum-graph__legend">
            <span class="momentum-graph__home"></span>
            <span class="momentum-graph__away"></span>
        </div>
        <div class="momentum-graph__plot" role="img" aria-label="Attack momentum loading">
            <div class="momentum-graph__bars" aria-hidden="true"></div>
        </div>
        <div class="momentum-graph__axis" aria-hidden="true"></div>
        <p class="momentum-graph__status" role="status">Loading momentum…</p>
    `;
    return graph;
}

export function renderMomentumGraph(graph, data, homeName, awayName) {
    const { slots, scale, ticks, pointCount } = buildMomentumTimeline(data);
    const bars = graph.querySelector(".momentum-graph__bars");
    const fragment = document.createDocumentFragment();
    for (const { minute, value } of slots) {
        const slice = document.createElement("div");
        slice.className = "momentum-graph__slice";
        slice.dataset.minute = minute;
        if (value !== null) {
            const bar = document.createElement("span");
            bar.className = `momentum-graph__bar ${value < 0 ? 'momentum-graph__bar--away' : 'momentum-graph__bar--home'}`;
            bar.style.height = `${Math.abs(value) / scale * 50}%`;
            slice.title = `${formatMomentumMinute(minute)}′ · ${value === 0 ? 'Balanced' : value > 0 ? homeName : awayName} · ${value}`;
            slice.appendChild(bar);
        }
        fragment.appendChild(slice);
    }
    bars.style.gridTemplateColumns = `repeat(${slots.length}, minmax(0, 1fr))`;
    bars.replaceChildren(fragment);
    graph.querySelector(".momentum-graph__home").textContent = homeName;
    graph.querySelector(".momentum-graph__away").textContent = awayName;
    const axis = graph.querySelector(".momentum-graph__axis");
    axis.replaceChildren();
    for (const tick of ticks) {
        const label = document.createElement("span");
        label.textContent = tick.label;
        label.style.left = `${tick.position}%`;
        axis.appendChild(label);
    }
    graph.dataset.hasData = String(pointCount > 0);
    graph.querySelector(".momentum-graph__plot").setAttribute("aria-label",
        `Attack momentum: ${homeName} in green above the baseline; ${awayName} in blue below. ${pointCount} minute samples.`);
    graph.querySelector(".momentum-graph__status").textContent = pointCount ? "" : "Momentum not available yet";
}

export function showMomentumError(graph) {
    const hasData = graph.dataset.hasData === "true";
    graph.querySelector(".momentum-graph__status").textContent = hasData
        ? "Momentum update failed · showing previous data"
        : "Momentum unavailable · retrying on next refresh";
    if (!hasData) graph.querySelector(".momentum-graph__plot").setAttribute("aria-label", "Attack momentum unavailable");
}
