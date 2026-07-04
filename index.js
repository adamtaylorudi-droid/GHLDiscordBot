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

// =========================
// STATE
// =========================

let agents = {};
let dashboardMessage;

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
// SLASH COMMANDS
// =========================

const commands = [
    new SlashCommandBuilder()
        .setName("online")
        .setDescription("Set your status to online"),

    new SlashCommandBuilder()
        .setName("offline")
        .setDescription("Set your status to offline")
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
        console.log("Command registration error:", err.message);
    }
}

// =========================
// HELPERS
// =========================

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    return `${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
}

// =========================
// GHL WEBHOOK (CALL STATE)
// =========================

app.post("/ghl-webhook", (req, res) => {
    const body = req.body;

    const agent = body?.agent_name || "Unknown";
    const event = body?.event;

    if (!agent || !event) return res.sendStatus(200);

    if (!agents[agent]) {
        agents[agent] = {
            presence: "offline",
            call: false,
            callStartTime: null,
            lastCallUpdate: 0
        };
    }

    // CALL START
    if (event === "call_started") {
        agents[agent].call = true;
        agents[agent].callStartTime = Date.now();
        agents[agent].lastCallUpdate = Date.now();
    }

    // CALL END
    if (event === "call_ended") {
        agents[agent].call = false;
        agents[agent].callStartTime = null;
        agents[agent].lastCallUpdate = Date.now();
    }

    console.log("GHL Update:", agent, agents[agent]);

    res.sendStatus(200);
});

// =========================
// SLASH COMMANDS (ROLE LOCK + NICKNAME)
// =========================

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const member = interaction.member;

    // ROLE CHECK
    const hasRole = member.roles.cache.some(r => r.name === "Agents");

    if (!hasRole) {
        return interaction.reply({
            content: "❌ You do not have permission (Agents only).",
            ephemeral: true
        });
    }

    // USE NICKNAME
    const name = member.displayName;

    if (!agents[name]) {
        agents[name] = {
            presence: "offline",
            call: false,
            callStartTime: null,
            lastCallUpdate: 0
        };
    }

    if (interaction.commandName === "online") {
        agents[name].presence = "online";

        return interaction.reply({
            content: "🟢 You are now ONLINE",
            ephemeral: true
        });
    }

    if (interaction.commandName === "offline") {
        agents[name].presence = "offline";

        return interaction.reply({
            content: "⚫ You are now OFFLINE",
            ephemeral: true
        });
    }
});

// =========================
// STALE CALL FIX (SAFETY NET)
// =========================

setInterval(() => {
    const now = Date.now();

    for (const agent in agents) {
        const data = agents[agent];

        if (
            data.call === true &&
            data.lastCallUpdate &&
            now - data.lastCallUpdate > 90 * 1000
        ) {
            console.log(`Fixing stale call state: ${agent}`);

            data.call = false;
            data.callStartTime = null;
            data.lastCallUpdate = now;
        }
    }
}, 15000);

// =========================
// DASHBOARD BUILDER (LIVE TIMER)
// =========================

function buildDashboard() {
    let output = [];

    for (const [name, data] of Object.entries(agents)) {
        let status = "";

        if (data.call) {
            const duration = data.callStartTime
                ? formatDuration(Date.now() - data.callStartTime)
                : "00:00";

            status = `🔴 On Call (${duration})`;
        } else if (data.presence === "online") {
            status = "🟢 Online";
        } else {
            status = "⚫ Offline";
        }

        output.push(`${name} — ${status}`);
    }

    return `📞 **Live Agent Dashboard**

${output.length ? output.join("\n") : "No agents online"}
`;
}

// =========================
// DISCORD READY
// =========================

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    await registerCommands();

    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    dashboardMessage = await channel.send(buildDashboard());

    // LIVE UPDATE EVERY SECOND (TIMERS)
    setInterval(() => {
        dashboardMessage.edit(buildDashboard()).catch(() => {});
    }, 1000);
});

// =========================
// START SYSTEM
// =========================

client.login(process.env.DISCORD_TOKEN);

app.listen(4000, () => {
    console.log("Bridge server running on port 4000");
});