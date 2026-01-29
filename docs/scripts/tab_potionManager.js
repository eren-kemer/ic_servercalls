const vpot = 1.000; // prettier-ignore
// LocalStorage key for include options
const pm_LSKey_includeOpts = `scIncludePotionOptions`;

// Potion IDs - built dynamically from util_buffs.js
let pm_speedPotionIds = [];
let pm_polishId = null;
let pm_specId = null;
let pm_nonSpeedPotionIds = [];

// last pulled counts (id -> amount)
let pm_last_counts = {};
// last status message to show in UI
let pm_last_status = "";

// Initialize potion IDs from util_buffs.js
function pm_initPotionIds() {
    // Find Speed potion IDs in b_basics
    pm_speedPotionIds = [];
    for (let id in b_basics) {
        const name = b_basics[id];
        if (name.includes("Speed") && (name.includes("Small") || name.includes("Medium") || name.includes("Large") || name.includes("Huge"))) {
            pm_speedPotionIds.push(Number(id));
        }
    }
    // Find Polish ID in b_pop
    for (let id in b_pop) {
        if (b_pop[id].includes("Polish")) {
            pm_polishId = Number(id);
            break;
        }
    }
    // Find Specialization ID in b_spec
    for (let id in b_spec) {
        pm_specId = Number(id);
        break; // Usually only one entry
    }
    // Build non-speed potion list from all potions
    pm_nonSpeedPotionIds = [];
    for (let id in b_basics) {
        const numId = Number(id);
        const name = b_basics[id];
        // Skip Speed potions
        if (name.includes("Speed")) continue;
        pm_nonSpeedPotionIds.push(numId);
    }
    for (let id in b_pop) pm_nonSpeedPotionIds.push(Number(id));
    for (let id in b_spec) pm_nonSpeedPotionIds.push(Number(id));
}

function pm_setStatus(msg, timeoutSec) {
    pm_last_status = msg || "";
    const ele = document.getElementById(`pm_status`);
    if (ele) ele.innerHTML = pm_last_status;
    if (timeoutSec && timeoutSec > 0) setTimeout(() => { pm_last_status = ""; const e = document.getElementById(`pm_status`); if (e) e.innerHTML = ""; }, timeoutSec * 1000);
}

async function pm_refreshPotionCounts(result) {
    // Use the servercall result to update potion counts
    // Lightweight refresh: update brewed potions count only without full UI re-render.
    if (result && result.success) {
        // Update counts based on the result
        for (let action of result.actions) {
            if (action.action === "set_buff_amount") {
                pm_last_counts[action.buff_id] = action.amount;
            }
        }
    } else {
        // Fallback: full pull if no result provided
        await pm_pullPotionData();
    }
}

async function pm_pullPotionData() {
    if (isBadUserData()) return;
    pm_initPotionIds(); // Initialize potion IDs from util_buffs.js
    disablePullButtons();
    const wrapper = document.getElementById(`potionWrapper`);
    wrapper.innerHTML = `Waiting for response...`;
    try {
        wrapper.innerHTML = `Waiting for user data...`;
        const details = await getUserDetails();
        // Collect potion counts from user details - only include known potion IDs
        pm_last_counts = {};
        for (let buff of details.details.buffs) {
            const buffId = buff.buff_id;
            if (!pm_nonSpeedPotionIds.includes(buffId) && !pm_speedPotionIds.includes(buffId)) continue;
            pm_last_counts[buffId] = buff.inventory_amount;
        }
        pm_displayPotionData(wrapper, pm_last_counts);
        codeEnablePullButtons();
    } catch (error) {
        handleError(wrapper, error);
    }
}

function pm_displayPotionData(wrapper, buffs) {
    let txt = ``;
    // Leave amounts header + explanation
    txt += `<span class="f fr w100 p5"><strong>Distill Control:</strong> Specify how many of each potion type to keep. Non-speed potions exceeding these amounts will be distilled.</span></span>`;
    txt += `<span class="f fr w100 p5"><span class="f falc fjs mr2" style="width:100%;flex-wrap:wrap;gap:8px">`;
    txt += `Small: <input type="number" id="pm_leave_small" min="0" value="1000" style="width:60px">`;
    txt += `Medium: <input type="number" id="pm_leave_medium" min="0" value="1000" style="width:60px">`;
    txt += `Large: <input type="number" id="pm_leave_large" min="0" value="1000" style="width:60px">`;
    txt += `Huge: <input type="number" id="pm_leave_huge" min="0" value="1000" style="width:60px">`;

    // Only show Polish/Spec inputs if their checkboxes are checked (check localStorage state)
    const includeOpts = pm_getPotionIncludeOptions();
    const includePolish = includeOpts.includes(`polish`);
    const includeSpec = includeOpts.includes(`spec`);
    if (includePolish) {
        txt += `Polish: <input type="number" id="pm_leave_polish" min="0" value="1000" style="width:60px">`;
//        txt += `<span style="display:inline-block;width:12px"></span>`;
    }
    if (includeSpec) {
        txt += `Spec: <input type="number" id="pm_leave_spec" min="0" value="1000" style="width:60px">`;
    }
    txt += `<span style="flex-basis:100%;height:0"></span>`; // line break for wrapping
    txt += `<input type="button" value="Distill" class="greenButton" onClick="pm_distillLeaveAtLeast()" style="margin-left:8px">`;
    txt += `</span></span>`;

    // Status + brew controls for Speed potions
    txt += `<span class="f fr w100 p5"><span id="pm_status" style="color:#006;margin-bottom:6px;display:block">${pm_last_status || ""}</span></span>`;
    txt += `<span class="f fr w100 p5"><strong>Speed potions:</strong></span>`;

    // Speed potion data from hardcoded IDs and util_buffs.js names
    const speedPotionData = [
        { id: 74, name: b_basics[74] }, // Small Potion of Speed
        { id: 75, name: b_basics[75] }, // Medium Potion of Speed
        { id: 76, name: b_basics[76] }, // Large Potion of Speed
        { id: 77, name: b_basics[77] }  // Huge Potion of Speed
    ];

    for (let potion of speedPotionData) {
        const id = potion.id;
        const name = potion.name;
        const amount = buffs[id] == null ? 0 : buffs[id];
        txt += `<span class="f fr w100 p5">`;
        txt += `<span class="f falc" style="width:25%;min-width:150px">${name}</span>`;
        txt += `<span class="f falc" style="width:15%;text-align:right"><span id="pm_potion_${id}_display">${nf(amount)}</span></span>`;
        txt += `<span class="f falc" style="width:60%;display:flex;gap:4px;align-items:center">`;
        txt += `<input type="number" id="pm_brew_amt_${id}" min="0" value="0" style="width:70px;margin-right:0" oninput="pm_updateBrewButtonVisibility(${id})">`;
        txt += `<span class="formsCampaignSelect greenButton" id="pm_brew_${id}_ButtonHolder"><input type="button" id="pm_brew_${id}_Button" value="Brew 0" class="" onClick="pm_brewSelected(${id})" style="visibility:hidden;width:80%"></span>`;
        txt += `</span>`;
        txt += `</span>`;
        txt += `</span>`;
    }

    wrapper.innerHTML = txt;
    // Wire static checkboxes to enable/disable inputs
    pm_initPotionIncludeOptions();
    pm_disableButtons(false);
}

function pm_disableButtons(disable) {
    if (disable == null) disable = true;
    for (let id of pm_speedPotionIds) {
        const input = document.getElementById(`pm_brew_amt_${id}`);
        const button = document.getElementById(`pm_brew_${id}_Button`);
        const buttonHolder = document.getElementById(`pm_brew_${id}_ButtonHolder`);
        if (input) input.disabled = disable;
        if (button) {
            button.disabled = disable;
            button.style.pointerEvents = disable ? 'none' : 'auto';
        }
        if (buttonHolder) {
            buttonHolder.className = disable
                ? `formsCampaignSelect greyButton`
                : `formsCampaignSelect greenButton`;
        }
    }
}

function pm_updateBrewButtonVisibility(id) {
    const input = document.getElementById(`pm_brew_amt_${id}`);
    const button = document.getElementById(`pm_brew_${id}_Button`);
    const buttonHolder = document.getElementById(`pm_brew_${id}_ButtonHolder`);
    if (!input || !button) return;

    // show button only if amount > 0
    const val = Number(input.value);
    if (val > 0) {
        button.value = `Brew ${nf(val)}`;
        button.style.visibility = ``;
        button.disabled = false;
        button.style.pointerEvents = 'auto';
        if (buttonHolder) buttonHolder.className = `formsCampaignSelect greenButton`;
    } else {
        button.style.visibility = `hidden`;
    }
}

function pm_initPotionIncludeOptions() {
    const includeOpts = pm_getPotionIncludeOptions();
    const polishCheckbox = document.getElementById(`pm_include_polish`);
    const specCheckbox = document.getElementById(`pm_include_spec`);
    if (polishCheckbox && includeOpts.includes(`polish`)) polishCheckbox.checked = true;
    if (specCheckbox && includeOpts.includes(`spec`)) specCheckbox.checked = true;
    // Update disabled state of leave inputs based on checkbox state
    pm_updatePotionIncludeInputStates();
}

function pm_togglePotionIncludeOptions(ele) {
    const optType = ele.dataset.type;
    if (!optType) return;
    const checked = ele.checked;
    const includeOpts = pm_getPotionIncludeOptions();
    if (checked && !includeOpts.includes(optType)) includeOpts.push(optType);
    else includeOpts.splice(includeOpts.indexOf(optType), 1);
    if (includeOpts.length === 0) localStorage.removeItem(pm_LSKey_includeOpts);
    else pm_setPotionIncludeOptions(includeOpts);
    // Re-render UI to show/hide Polish and Spec inputs dynamically
    const wrapper = document.getElementById(`potionWrapper`);
    if (wrapper) pm_displayPotionData(wrapper, pm_last_counts);
}

function pm_getPotionIncludeOptions() {
    const opts = localStorage.getItem(pm_LSKey_includeOpts);
    if (!opts) return [];
    return JSON.parse(opts);
}

function pm_setPotionIncludeOptions(opts) {
    localStorage.setItem(pm_LSKey_includeOpts, JSON.stringify(opts));
}

function pm_updatePotionIncludeInputStates() {
    const polishCheckbox = document.getElementById(`pm_include_polish`);
    const polishInput = document.getElementById(`pm_leave_polish`);
    const specCheckbox = document.getElementById(`pm_include_spec`);
    const specInput = document.getElementById(`pm_leave_spec`);
    if (polishInput) polishInput.disabled = !polishCheckbox?.checked;
    if (specInput) specInput.disabled = !specCheckbox?.checked;
}

async function pm_brewSelected(id) {
    const input = document.getElementById(`pm_brew_amt_${id}`);
    if (input == null) return;
    const amount = Number(input.value);
    if (!amount || amount <= 0) return;
    const wrapper = document.getElementById(`potionWrapper`);
    const preAmount = Number(pm_last_counts[id] || 0);
    const buffName = b_basics[id] || `Potion ${id}`;
    pm_setStatus(`Brewing ${amount}...`, 5);
    // Disable Buttons while waiting for brewing
    pm_disableButtons(true);
    try {
        const result = await brewPotions(id, amount);
        await pm_refreshPotionCounts(result);
        // compute brewed delta from refreshed counts
        const newAmount = Number(pm_last_counts[id] || 0);
        const brewed = newAmount - preAmount;
        if (brewed > 0) pm_setStatus(`Brewed ${brewed} ${buffName}.`, 6);
        else pm_setStatus(`No potions brewed — insufficient reagents.`, 6);
        pm_displayPotionData(wrapper, pm_last_counts);
        // Enable Brew buttons again
        pm_disableButtons(false);
    } catch (error) {
        handleError(wrapper, error);
        pm_setStatus(`Brew failed: ${error.message || error}`, 8);
    }
    finally {
        pm_disableButtons(false);
    }
}

// Helper: get potion size category from ID
function pm_getPotionSize(buffId) {
    const name = b_basics[buffId];
    if (!name) return null;
    const lower = name.toLowerCase();
    if (lower.includes("huge")) return "huge";
    if (lower.includes("large")) return "large";
    if (lower.includes("medium")) return "medium";
    if (lower.includes("small")) return "small";
    return null;
}

// Convenience helpers
function pm_collectCurrentCounts() {
    const counts = {};
    for (let id in pm_last_counts) {
        counts[id] = Number(pm_last_counts[id] || 0);
    }
    return counts;
}

async function pm_distillComputed(payload) {
    const wrapper = document.getElementById(`potionWrapper`);
    const totalToDistill = Object.values(payload).reduce((s, v) => s + (Number(v) || 0), 0);
    pm_setStatus(`Distilling ${totalToDistill} potions...`, 5);
    try {
        const result = await distillPotions(payload);
       // Add together actually distilled amounts from result and show in status
        let distilledPotions = 0;
        if (result && result.actions) {
            for (let action of result.actions) {
                if (action.action === "set_buff_amount") {
                    distilledPotions += (pm_last_counts[action.buff_id] - action.amount || 0);
                    pm_last_counts[action.buff_id] = action.amount;
                }
            }
            pm_displayPotionData(wrapper, pm_last_counts);
            pm_setStatus(`Distilled ${distilledPotions} potions.`, 6);
        } else { pm_setStatus("Distillation failed.", 6); }
    } catch (error) {
        handleError(wrapper, error);
    }

}


// Distill leaving at least X of each non-speed potion by size; use separate amounts for Small/Medium/Large/Huge/Specialization/Polish
function pm_distillLeaveAtLeast() {
    if (Object.keys(pm_last_counts).length === 0) { pm_pullPotionData(); return; }
    const leaveSmall = Math.max(0, Number(document.getElementById(`pm_leave_small`)?.value) || 0);
    const leaveMedium = Math.max(0, Number(document.getElementById(`pm_leave_medium`)?.value) || 0);
    const leaveLarge = Math.max(0, Number(document.getElementById(`pm_leave_large`)?.value) || 0);
    const leaveHuge = Math.max(0, Number(document.getElementById(`pm_leave_huge`)?.value) || 0);
    const leaveSpec = Math.max(0, Number(document.getElementById(`pm_leave_spec`)?.value) || 0);
    const includeSpec = document.getElementById(`pm_include_spec`)?.checked || false;
    const leavePolish = Math.max(0, Number(document.getElementById(`pm_leave_polish`)?.value) || 0);
    const includePolish = document.getElementById(`pm_include_polish`)?.checked || false;
    const counts = pm_collectCurrentCounts();
    const payload = {};
    for (let id in counts) {
        const buffId = Number(id);
        // Skip speed potions
        if (pm_speedPotionIds.includes(buffId)) continue;
        // Only process known non-speed potion IDs
        if (!pm_nonSpeedPotionIds.includes(buffId)) continue;
        // Skip legendary potions - never distill them
        const potionName = b_basics[buffId];
        if (potionName && potionName.includes("Legendary")) continue;
        const amount = counts[buffId] || 0;
        // Determine leave amount by type
        let leave = 0;
        let shouldDistill = false;
        if (buffId === pm_specId) {
            // Potion of Specialization
            shouldDistill = includeSpec;
            leave = leaveSpec;
        } else if (buffId === pm_polishId) {
            // Potion of Polish
            shouldDistill = includePolish;
            leave = leavePolish;
        } else {
            // Regular size-based potions
            shouldDistill = true;
            const size = pm_getPotionSize(buffId);
            if (size === "small") leave = leaveSmall;
            else if (size === "medium") leave = leaveMedium;
            else if (size === "large") leave = leaveLarge;
            else if (size === "huge") leave = leaveHuge;
        }
        // Only distill if allowed (checkbox enabled or regular potion)
        if (!shouldDistill) continue;
        // Distill excess
        const toDistill = Math.max(0, amount - leave);
        if (toDistill > 0) payload[buffId] = toDistill;
    }
    // if there is nothing to distill set Status to notify user
    if (Object.keys(payload).length === 0) {
        pm_setStatus("Not enough potions to distill.", 6);
        return;
    }
    pm_distillComputed(payload);
}