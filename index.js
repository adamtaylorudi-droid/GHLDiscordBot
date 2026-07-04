require("dotenv").config();

const express = require("express");
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;

// =========================
// STATE
// =========================

let agents = {};

// =========================
// DISCORD CLIENT
// =========================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// =========================
// SLASH COMMANDS (ONLY ONE BLOCK — FIXED)
// =========================

const commands = [
    new SlashCommandBuilder()
        .setName("online")
        .setDescription("Set yourself online"),

    new SlashCommandBuilder()
        .setName("offline")
        .setDescription("Set yourself offline")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
    try {
        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            { body: commands }
        );

        console.log("Slash commands registered");
    } catch (err) {
        console.log("Command register error:", err.message);
    }
}

// =========================
// STATE HELPERS
// =========================

function getAgent(name) {
    if (!name) name = "Unknown Agent";

    if (!agents[name]) {
        agents[name] = {
            presence: "offline",
            call: false,
            callStartTime: null
        };
    }
    return agents[name];
}

// =========================
// NORMALIZE PAYLOAD (FIXED)
// =========================

function normalize(body) {
    return body?.body || body || {};
}

// =========================
// PARSE GHL
// =========================

function parseGHL(body) {
    const payload = normalize(body);

    const event =
        payload?.event ||
        payload?.type ||
        payload?.call_status ||
        "unknown";

    const agent =
        payload?.agent_name ||
        payload?.agent?.name ||
        payload?.user?.name ||
        (payload?.user
            ? `${payload.user.firstName || ""} ${payload.user.lastName || ""}`.trim()
            : "") ||
        "Unknown Agent";

    return { event, agent };
}

// =========================
// WEBHOOK ROUTE
// =========================

app.post("/ghl-webhook", (req, res) => {
    try {
        console.log("RAW WEBHOOK:", JSON.stringify(req.body, null, 2));

        const { event, agent } = parseGHL(req.body);

        console.log("PROCESSED EVENT:", { event, agent });

        if (!event || event === "unknown") {
            console.log("⚠️ Missing event");
            return res.sendStatus(200);
        }

        const data = getAgent(agent);

        if (event === "call_started") {
            data.call = true;
            data.callStartTime = Date.now();
        }

        if (event === "call_ended") {
            data.call = false;
            data.callStartTime = null;
        }

        res.sendStatus(200);

    } catch (err) {
        console.log("Webhook error:", err.message);
        res.sendStatus(200);
    }
});

// =========================
// SLASH COMMANDS (FIXED INTERACTION HANDLING)
// =========================

client.on("interactionCreate", async interaction => {
    try {
        if (!interaction.isChatInputCommand()) return;

        const member = interaction.member;

        const allowed = member.roles.cache.some(r => r.name === "Agents");

        if (!allowed) {
            return interaction.reply({
                content: "❌ Agents only.",
                flags: 64
            });
        }

        await interaction.deferReply({ flags: 64 });

        const name = member.displayName;
        const data = getAgent(name);

        if (interaction.commandName === "online") {
            data.presence = "online";
            return interaction.editReply("🟢 You are now online");
        }

        if (interaction.commandName === "offline") {
            data.presence = "offline";
            return interaction.editReply("⚫ You are now offline");
        }

    } catch (err) {
        console.log("Interaction error:", err);

        if (interaction.replied || interaction.deferred) return;
    }
});

// =========================
// DASHBOARD
// =========================

function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildDashboard() {
    let output = [];

    for (const [name, data] of Object.entries(agents)) {
        let status;

        if (data.call) {
            const duration = data.callStartTime
                ? formatTime(Date.now() - data.callStartTime)
                : "0:00";

            status = `🔴 On Call (${duration})`;
        } else if (data.presence === "online") {
            status = "🟢 Online";
        } else {
            status = "⚫ Offline";
        }

        output.push(`${name} — ${status}`);
    }

    return `📞 Live Agent Dashboard\n\n${output.join("\n") || "No agents"}`;
}

// =========================
// DISCORD READY
// =========================

client.once("clientReady", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    await registerCommands();

    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    let msg = await channel.send(buildDashboard());

    setInterval(() => {
        msg.edit(buildDashboard()).catch(() => {});
    }, 2000);
});

// =========================
// START SERVER + BOT
// =========================

client.login(process.env.DISCORD_TOKEN);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});// =========================

const commands = [
    new SlashCommandBuilder()
        .setName("online")
        .setDescription("Set yourself online"),

    new SlashCommandBuilder()
        .setName("offline")
        .setDescription("Set yourself offline")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
    try {
        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            { body: commands }
        );

        console.log("Slash commands registered");
    } catch (err) {
        console.log("Command register error:", err.message);
    }
}

// =========================
// STATE HELPERS
// =========================

function getAgent(name) {
    if (!name) name = "Unknown Agent";

    if (!agents[name]) {
        agents[name] = {
            presence: "offline",
            call: false,
            callStartTime: null
        };
    }
    return agents[name];
}

// =========================
// PAYLOAD NORMALIZER (FIXED)
// =========================

function normalize(body) {
    return body?.body || body || {};
}

// =========================
// PARSE GHL (FIXED SAFETY)
// =========================

function parseGHL(body) {
    const payload = normalize(body);

    const event =
        payload?.event ||
        payload?.type ||
        payload?.call_status ||
        "unknown";

    const agent =
        payload?.agent_name ||
        payload?.agent?.name ||
        payload?.user?.name ||
        (payload?.user
            ? `${payload.user.firstName || ""} ${payload.user.lastName || ""}`.trim()
            : "") ||
        "Unknown Agent";

    return { event, agent };
}

// =========================
// WEBHOOK ROUTE
// =========================

app.post("/ghl-webhook", (req, res) => {
    try {
        console.log("RAW WEBHOOK:", JSON.stringify(req.body, null, 2));

        const { event, agent } = parseGHL(req.body);

        console.log("PROCESSED EVENT:", { event, agent });

        if (!event || event === "unknown") {
            console.log("⚠️ Missing event");
            return res.sendStatus(200);
        }

        const data = getAgent(agent);

        // CALL STATE
        if (event === "call_started") {
            data.call = true;
            data.callStartTime = Date.now();
        }

        if (event === "call_ended") {
            data.call = false;
            data.callStartTime = null;
        }

        res.sendStatus(200);

    } catch (err) {
        console.log("Webhook error:", err.message);
        res.sendStatus(200);
    }
});

// =========================
// SLASH COMMANDS (FIXED 10062 + FLAGS)
// =========================

client.on("interactionCreate", async interaction => {
    try {
        if (!interaction.isChatInputCommand()) return;

        const member = interaction.member;

        const allowed = member.roles.cache.some(r => r.name === "Agents");

        if (!allowed) {
            return interaction.reply({
                content: "❌ Agents only.",
                flags: 64
            });
        }

        // 🔥 FIX: prevents Unknown Interaction (10062)
        await interaction.deferReply({ flags: 64 });

        const name = member.displayName;
        const data = getAgent(name);

        if (interaction.commandName === "online") {
            data.presence = "online";
            return interaction.editReply("🟢 You are now online");
        }

        if (interaction.commandName === "offline") {
            data.presence = "offline";
            return interaction.editReply("⚫ You are now offline");
        }

    } catch (err) {
        console.log("Interaction error:", err);

        if (interaction.replied || interaction.deferred) return;
    }
});

// =========================
// DASHBOARD
// =========================

function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildDashboard() {
    let output = [];

    for (const [name, data] of Object.entries(agents)) {
        let status;

        if (data.call) {
            const duration = data.callStartTime
                ? formatTime(Date.now() - data.callStartTime)
                : "0:00";

            status = `🔴 On Call (${duration})`;
        } else if (data.presence === "online") {
            status = "🟢 Online";
        } else {
            status = "⚫ Offline";
        }

        output.push(`${name} — ${status}`);
    }

    return `📞 Live Agent Dashboard\n\n${output.join("\n") || "No agents"}`;
}

// =========================
// DISCORD READY (FIXED WARNING)
// =========================

client.once("clientReady", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    await registerCommands();

    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    let msg = await channel.send(buildDashboard());

    setInterval(() => {
        msg.edit(buildDashboard()).catch(() => {});
    }, 2000);
});

// =========================
// START SERVER
// =========================

client.login(process.env.DISCORD_TOKEN);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});// =========================

const commands = [
    new SlashCommandBuilder()
        .setName("online")
        .setDescription("Set yourself online"),

    new SlashCommandBuilder()
        .setName("offline")
        .setDescription("Set yourself offline")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
    try {
        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            { body: commands }
        );

        console.log("Slash commands registered");
    } catch (err) {
        console.log("Command register error:", err.message);
    }
}

// =========================
// SAFE AGENT INIT
// =========================

function getAgent(name) {
    if (!name) name = "Unknown Agent";

    if (!agents[name]) {
        agents[name] = {
            presence: "offline",
            call: false,
            callStartTime: null
        };
    }
    return agents[name];
}

// =========================
// NORMALIZE PAYLOAD (🔥 FIXED)
// =========================

function normalizePayload(reqBody) {
    // handles BOTH:
    // 1. { event, agent_name }
    // 2. { body: { event, agent_name } }

    return reqBody?.body || reqBody || {};
}

// =========================
// EXTRACT EVENT + AGENT (🔥 FIXED)
// =========================

function parseGHL(body) {
    const payload = normalizePayload(body);

    let event =
        payload?.event ||
        payload?.type ||
        payload?.call_status ||
        "unknown";

    let agent =
        payload?.agent_name ||
        payload?.agent?.name ||
        payload?.user?.name ||
        (payload?.user
            ? `${payload.user.firstName || ""} ${payload.user.lastName || ""}`.trim()
            : "") ||
        "Unknown Agent";

    return { event, agent };
}

// =========================
// WEBHOOK ROUTE
// =========================

app.post("/ghl-webhook", (req, res) => {
    try {
        console.log("RAW WEBHOOK:", JSON.stringify(req.body, null, 2));

        const { event, agent } = parseGHL(req.body);

        console.log("PROCESSED EVENT:", { event, agent });

        if (!event || event === "unknown") {
            console.log("⚠️ Missing event");
            return res.sendStatus(200);
        }

        const data = getAgent(agent);

        // =========================
        // CALL STATE LOGIC
        // =========================

        if (event === "call_started") {
            data.call = true;
            data.callStartTime = Date.now();
        }

        if (event === "call_ended") {
            data.call = false;
            data.callStartTime = null;
        }

        res.sendStatus(200);

    } catch (err) {
        console.log("Webhook error:", err.message);
        res.sendStatus(200);
    }
});

// =========================
// ROLE PROTECTED SLASH COMMANDS
// =========================

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const member = interaction.member;

    const allowed = member.roles.cache.some(r => r.name === "Agents");

    if (!allowed) {
        return interaction.reply({
            content: "❌ Agents only.",
            ephemeral: true
        });
    }

    const name = member.displayName;
    const data = getAgent(name);

    if (interaction.commandName === "online") {
        data.presence = "online";

        return interaction.reply({
            content: "🟢 You are now online",
            ephemeral: true
        });
    }

    if (interaction.commandName === "offline") {
        data.presence = "offline";

        return interaction.reply({
            content: "⚫ You are now offline",
            ephemeral: true
        });
    }
});

// =========================
// DASHBOARD
// =========================

function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildDashboard() {
    let output = [];

    for (const [name, data] of Object.entries(agents)) {
        let status;

        if (data.call) {
            const duration = data.callStartTime
                ? formatTime(Date.now() - data.callStartTime)
                : "0:00";

            status = `🔴 On Call (${duration})`;
        } else if (data.presence === "online") {
            status = "🟢 Online";
        } else {
            status = "⚫ Offline";
        }

        output.push(`${name} — ${status}`);
    }

    return `📞 Live Agent Dashboard\n\n${output.join("\n") || "No agents"}`;
}

// =========================
// DISCORD READY
// =========================

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    await registerCommands();

    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    let msg = await channel.send(buildDashboard());

    setInterval(() => {
        msg.edit(buildDashboard()).catch(() => {});
    }, 2000);
});

// =========================
// START
// =========================

client.login(process.env.DISCORD_TOKEN);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
