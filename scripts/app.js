import { createMomentumGraph, renderMomentumGraph, showMomentumError } from "./momentumGraph.js";
import { addDragAndDropHandlers } from "./dragAndDrop.js";
import {
    getLiveEventsList,
    getSatsFromAPI,
    getMomentumFromAPI
} from "./apiConfig.js";

const mainCont = document.querySelector(".main-container");
const leagueSelector = document.querySelector("#leagueSelector");
const matchSearch = document.querySelector("#matchSearch");
const refreshButton = document.querySelector("#refreshButton");
const statusDot = document.querySelector("#statusDot");
const statusText = document.querySelector("#statusText");
const matchCount = document.querySelector("#matchCount");
const lastUpdated = document.querySelector("#lastUpdated");
const emptyState = document.querySelector("#emptyState");

const scoreUpdateInterval = 30000;
const statsUpdateInterval = 60000;
const maxParallelStatRequests = 4;

const statConfigs = [
    { key: "ballPossession", name: "Possession", weight: 0.2 },
    { key: "expectedGoals", name: "xG", weight: 7 },
    { key: "bigChanceCreated", name: "Big chances", weight: 5 },
    { key: "totalShotsOnGoal", name: "Shots", weight: 1.6 },
    { key: "totalShotsInsideBox", name: "Shots in box", weight: 2 },
    { key: "totalShotsOutsideBox", name: "Shots outside", weight: 0.8 },
    { key: "cornerKicks", name: "Corners", weight: 1.4 },
    { key: "passes", name: "Passes", weight: 0.02 },
    { key: "totalClearance", name: "Clearances", weight: 0 },
    { key: "yellowCards", name: "Yellow cards", weight: 0 },
    { key: "redCards", name: "Red cards", weight: 0 },
    { key: "touchesInOppBox", name: "Box touches", weight: 1.2 }
];

let liveMatchesList = [];
let dismissedMatchIds = new Set();
let liveRefreshInFlight = false;
let statsRefreshInFlight = false;
let momentumRefreshInFlight = false;
const momentumRequests = new WeakMap();
const momentumUpdatedAt = new WeakMap();

function setStatus(message, type = "idle") {
    statusText.textContent = message;
    statusDot.dataset.status = type;
}

function formatUpdatedAt(date = new Date()) {
    return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }).format(date);
}

function getTeamName(team) {
    return team?.shortName || team?.name || "Team";
}

function getScore(score) {
    return score?.current ?? score?.display ?? "-";
}

function getMatchStatus(match) {
    return match.status?.description || match.status?.type || "Live";
}

function getPeriodIndex(periodName) {
    if (periodName === "1ST") return 1;
    if (periodName === "2ND") return 2;
    return 0;
}

function normalizeStatValue(value) {
    if (value === null || value === undefined || value === "-") return null;
    const cleaned = String(value).replace("%", "").replace(",", ".").trim();
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}

function getCardSearchText(match) {
    return [
        match.homeTeam?.name,
        getTeamName(match.homeTeam),
        match.awayTeam?.name,
        getTeamName(match.awayTeam),
        match.tournament?.name,
        match.category?.name
    ].filter(Boolean).join(" ").toLowerCase();
}

function createPeriodSelector(matchID) {
    const periodSelectorDiv = document.createElement("div");
    periodSelectorDiv.classList.add("period-selector");
    periodSelectorDiv.dataset.matchId = matchID;

    ["ALL", "1ST", "2ND"].forEach((period) => {
        const button = document.createElement("button");
        button.classList.add("period-btn");
        button.type = "button";
        button.dataset.period = period;
        button.textContent = period;

        if (period === "ALL") button.classList.add("period-btn--selected");
        periodSelectorDiv.appendChild(button);
    });

    return periodSelectorDiv;
}

function createStatsElement(matchID) {
    const statsDiv = document.createElement("div");
    statsDiv.classList.add("stats");
    statsDiv.dataset.matchId = matchID;

    statConfigs.forEach((stat) => {
        const row = document.createElement("div");
        row.classList.add("stat-row");
        row.dataset.statKey = stat.key;

        const homeValue = document.createElement("span");
        homeValue.classList.add("stat-value");
        homeValue.dataset.side = "home";
        homeValue.dataset.statKey = stat.key;
        homeValue.textContent = "-";

        const label = document.createElement("span");
        label.classList.add("stat-label");
        label.textContent = stat.name;

        const awayValue = document.createElement("span");
        awayValue.classList.add("stat-value");
        awayValue.dataset.side = "away";
        awayValue.dataset.statKey = stat.key;
        awayValue.textContent = "-";

        row.append(homeValue, label, awayValue);
        statsDiv.appendChild(row);
    });

    return statsDiv;
}

function updateCardHeader(matchCard, match) {
    const homeName = getTeamName(match.homeTeam);
    const awayName = getTeamName(match.awayTeam);

    matchCard.dataset.id = match.id;
    matchCard.id = match.id;
    matchCard.dataset.league = match.tournament?.name || "Unknown league";
    matchCard.dataset.home = homeName;
    matchCard.dataset.away = awayName;
    matchCard.dataset.searchText = getCardSearchText(match);

    matchCard.querySelector(".team-name--home").textContent = homeName;
    matchCard.querySelector(".team-name--away").textContent = awayName;
    matchCard.querySelector(".scoreline__score").textContent = `${getScore(match.homeScore)} - ${getScore(match.awayScore)}`;
    matchCard.querySelector(".match-card__meta").textContent = `${matchCard.dataset.league} | ${getMatchStatus(match)}`;
}

function createMatchCard(match) {
    const matchCard = document.createElement("article");
    matchCard.classList.add("match-card");
    matchCard.draggable = true;

    const matchCardHeader = document.createElement("header");
    matchCardHeader.classList.add("match-card__header");

    const btnRemoveCard = document.createElement("button");
    btnRemoveCard.classList.add("close-btn");
    btnRemoveCard.type = "button";
    btnRemoveCard.textContent = "X";
    btnRemoveCard.title = "Hide match";
    btnRemoveCard.setAttribute("aria-label", "Hide match");

    const headerContent = document.createElement("div");
    headerContent.classList.add("match-card__title");

    const scoreline = document.createElement("div");
    scoreline.classList.add("scoreline");
    scoreline.innerHTML = `
        <span class="team-name team-name--home"></span>
        <strong class="scoreline__score"></strong>
        <span class="team-name team-name--away"></span>
    `;

    const meta = document.createElement("p");
    meta.classList.add("match-card__meta");

    headerContent.append(scoreline, meta);
    matchCardHeader.append(btnRemoveCard, headerContent);

    const signal = document.createElement("p");
    signal.classList.add("match-card__signal");
    signal.textContent = "Stats pending";

    const graph = createMomentumGraph();

    matchCard.append(
        matchCardHeader,
        signal,
        graph,
        createPeriodSelector(match.id),
        createStatsElement(match.id)
    );

    updateCardHeader(matchCard, match);
    addDragAndDropHandlers(matchCard);

    return matchCard;
}

function updateLeagueOptions(matches) {
    const selectedLeague = leagueSelector.value || "All";
    const leagues = [...new Set(matches.map((match) => match.tournament?.name).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    const options = [new Option("All leagues", "All")];
    leagues.forEach((league) => options.push(new Option(league, league)));
    leagueSelector.replaceChildren(...options);

    leagueSelector.value = leagues.includes(selectedLeague) ? selectedLeague : "All";
}

function renderMatches(matches) {
    const activeIds = new Set(matches.map((match) => String(match.id)));
    const fragment = document.createDocumentFragment();

    document.querySelectorAll(".match-card").forEach((card) => {
        if (!activeIds.has(String(card.dataset.id))) card.remove();
    });

    matches.forEach((match) => {
        const existingCard = document.querySelector(`.match-card[data-id="${match.id}"]`);

        if (existingCard) {
            updateCardHeader(existingCard, match);
            return;
        }

        fragment.appendChild(createMatchCard(match));
    });

    mainCont.appendChild(fragment);
    updateLeagueOptions(matches);
    applyFilters();
}

function applyFilters() {
    const selectedLeague = leagueSelector.value;
    const query = matchSearch.value.trim().toLowerCase();
    const cards = [...document.querySelectorAll(".match-card")];
    let visibleCount = 0;

    cards.forEach((card) => {
        const isDismissed = dismissedMatchIds.has(String(card.dataset.id));
        const matchesLeague = selectedLeague === "All" || card.dataset.league === selectedLeague;
        const matchesSearch = !query || card.dataset.searchText.includes(query);
        const shouldShow = !isDismissed && matchesLeague && matchesSearch;

        card.hidden = !shouldShow;
        if (shouldShow) visibleCount += 1;
    });

    matchCount.textContent = `${visibleCount} visible / ${cards.length} matches`;
    emptyState.textContent = cards.length > 0
        ? "No matches match the current filters."
        : "No live matches right now.";
    emptyState.hidden = cards.length > 0 && visibleCount > 0;
}

async function updateLiveMatchesList() {
    const response = await getLiveEventsList();
    liveMatchesList = response.events || [];
}

async function getMatchStats(matchID, period = 0) {
    const response = await getSatsFromAPI(matchID);
    const periodStats = response.statistics?.[period];
    if (!periodStats) return [];

    return (periodStats.groups || []).flatMap((group) => group.statisticsItems || []);
}

function updatePressureSignal(matchCard, statMap) {
    let homePressure = 0;
    let awayPressure = 0;

    statConfigs.forEach((config) => {
        if (!config.weight) return;

        const stat = statMap.get(config.key);
        const home = normalizeStatValue(stat?.home);
        const away = normalizeStatValue(stat?.away);

        if (home !== null) homePressure += home * config.weight;
        if (away !== null) awayPressure += away * config.weight;
    });

    const signal = matchCard.querySelector(".match-card__signal");
    const delta = homePressure - awayPressure;
    const threshold = 4;

    signal.classList.remove("match-card__signal--home", "match-card__signal--away", "match-card__signal--neutral");

    if (Math.abs(delta) < threshold) {
        signal.textContent = "Balanced pressure";
        signal.classList.add("match-card__signal--neutral");
        return;
    }

    if (delta > 0) {
        signal.textContent = `${matchCard.dataset.home} pressure +${Math.abs(delta).toFixed(1)}`;
        signal.classList.add("match-card__signal--home");
        return;
    }

    signal.textContent = `${matchCard.dataset.away} pressure +${Math.abs(delta).toFixed(1)}`;
    signal.classList.add("match-card__signal--away");
}

function updateStatsTextForMatch(matchCard, statsReturned) {
    const statMap = new Map(statsReturned.map((stat) => [stat.key, stat]));

    statConfigs.forEach((config) => {
        const stat = statMap.get(config.key);
        const row = matchCard.querySelector(`.stat-row[data-stat-key="${CSS.escape(config.key)}"]`);
        const homeValue = row?.querySelector(".stat-value[data-side='home']");
        const awayValue = row?.querySelector(".stat-value[data-side='away']");

        if (!row || !homeValue || !awayValue) return;

        const home = stat?.home ?? "-";
        const away = stat?.away ?? "-";
        const homeNumber = normalizeStatValue(home);
        const awayNumber = normalizeStatValue(away);

        homeValue.textContent = home;
        awayValue.textContent = away;
        row.classList.remove("stat-row--home-leading", "stat-row--away-leading");

        if (homeNumber === null || awayNumber === null || homeNumber === awayNumber) return;
        row.classList.add(homeNumber > awayNumber ? "stat-row--home-leading" : "stat-row--away-leading");
    });

    updatePressureSignal(matchCard, statMap);
}

async function updateStatsForCard(matchCard) {
    const selectedButton = matchCard.querySelector(".period-btn--selected");
    const selectedPeriodIndex = getPeriodIndex(selectedButton?.dataset.period);
    const statsReturned = await getMatchStats(matchCard.dataset.id, selectedPeriodIndex);

    updateStatsTextForMatch(matchCard, statsReturned);
}

async function updateStatsForVisible() {
    if (statsRefreshInFlight) return;

    const cards = [...document.querySelectorAll(".match-card:not([hidden])")];
    if (cards.length === 0) return;

    statsRefreshInFlight = true;

    try {
        let cursor = 0;
        const workers = Array.from({ length: Math.min(maxParallelStatRequests, cards.length) }, async () => {
            while (cursor < cards.length) {
                const card = cards[cursor];
                cursor += 1;

                try {
                    await updateStatsForCard(card);
                } catch (error) {
                    card.querySelector(".match-card__signal").textContent = "Stats unavailable";
                    console.error(`Error updating stats for ${card.dataset.id}:`, error.message);
                }
            }
        });

        await Promise.all(workers);
    } finally {
        statsRefreshInFlight = false;
    }
}

async function updateMomentumForCard(card, { force = false } = {}) {
    if (momentumRequests.has(card)) return momentumRequests.get(card);
    if (!force && Date.now() - (momentumUpdatedAt.get(card) || 0) < scoreUpdateInterval) return;

    const graph = card.querySelector(".momentum-graph");
    const request = (async () => {
        try {
            const data = await getMomentumFromAPI(card.dataset.id);
            renderMomentumGraph(graph, data, card.dataset.home, card.dataset.away);
        } catch (error) {
            showMomentumError(graph);
            console.error(`Error updating momentum for ${card.dataset.id}:`, error.message);
        } finally {
            momentumUpdatedAt.set(card, Date.now());
            momentumRequests.delete(card);
        }
    })();
    momentumRequests.set(card, request);
    return request;
}

async function updateMomentumForVisible({ force = false } = {}) {
    if (momentumRefreshInFlight) return;
    momentumRefreshInFlight = true;
    try {
        const cards = [...document.querySelectorAll(".match-card:not([hidden])")];
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(maxParallelStatRequests, cards.length) }, async () => {
            while (cursor < cards.length) {
                const card = cards[cursor++];
                if (card.isConnected && !card.hidden) await updateMomentumForCard(card, { force });
            }
        }));
    } finally {
        momentumRefreshInFlight = false;
        // A filter or score refresh may have revealed cards while requests were in flight.
        if ([...document.querySelectorAll(".match-card:not([hidden])")].some((card) => !momentumUpdatedAt.has(card))) {
            void updateMomentumForVisible();
        }
    }
}

async function loadLiveMatches({ refreshStats = false } = {}) {
    if (liveRefreshInFlight) return;

    liveRefreshInFlight = true;
    refreshButton.disabled = true;
    setStatus("Loading live matches", "loading");

    try {
        await updateLiveMatchesList();
        renderMatches(liveMatchesList);
        lastUpdated.textContent = `Updated ${formatUpdatedAt()}`;
        setStatus("Live board updated", "ok");

        if (refreshStats) updateStatsForVisible();
    } catch (error) {
        setStatus(error.message || "Could not load live matches", "error");
        console.error("Error loading live matches:", error);
    } finally {
        void updateMomentumForVisible({ force: true });
        liveRefreshInFlight = false;
        refreshButton.disabled = false;
    }
}

function handleCardClick(event) {
    const closeButton = event.target.closest(".close-btn");
    const periodButton = event.target.closest(".period-btn");
    const card = event.target.closest(".match-card");

    if (closeButton && card) {
        dismissedMatchIds.add(String(card.dataset.id));
        applyFilters();
        return;
    }

    if (periodButton && card) {
        card.querySelectorAll(".period-btn").forEach((button) => {
            button.classList.toggle("period-btn--selected", button === periodButton);
        });

        updateStatsForCard(card).catch((error) => {
            card.querySelector(".match-card__signal").textContent = "Stats unavailable";
            console.error("Error updating stats after period change:", error.message);
        });
        return;
    }

    if (!card || event.target.closest("button, input, select, summary, a")) return;
    card.classList.toggle("match-card--selected");
}

function bindEvents() {
    const filterMatches = () => {
        applyFilters();
        void updateMomentumForVisible();
    };
    leagueSelector.addEventListener("change", filterMatches);
    matchSearch.addEventListener("input", filterMatches);
    refreshButton.addEventListener("click", () => loadLiveMatches({ refreshStats: true }));

    document.addEventListener("click", handleCardClick);
}

async function main() {
    bindEvents();

    await loadLiveMatches({ refreshStats: true });

    window.setInterval(() => loadLiveMatches(), scoreUpdateInterval);
    window.setInterval(updateStatsForVisible, statsUpdateInterval);
}

main();
