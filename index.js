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
// SLASH COMMANDS
// =========================

const commands = [
    new SlashCommandBuilder()
        .setName("online")
        .setDescription("Set yourself online"),

    new SlashCommandBuilder()
        .setName("offline")
        .setDescription("Set yourself offline")
].map(c => c.toJSON());

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
        console.log("Command error:", err.message);
    }
}

// =========================
// SAFE AGENT INIT
// =========================

function ensureAgent(name) {
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
// WEBHOOK (REAL GHL LOGIC)
// =========================

app.post("/ghl-webhook", (req, res) => {
    try {
        const body = req.body;

        // ---- FIX: handle nested GHL payloads safely ----
        let event = body?.event;
        let agent = body?.agent_name;

        if (!agent && body?.customData?.status) {
            try {
                const parsed = JSON.parse(body.customData.status);
                agent = parsed.agent_name;
                event = parsed.event || event;
            } catch (e) {}
        }

        if (!agent || !event) return res.sendStatus(200);

        const data = ensureAgent(agent);

        console.log("GHL EVENT:", agent, event);

        // =========================
        // ONLY REAL STATE CHANGES
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
// DISCORD COMMANDS (ROLE LOCK)
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
    const data = ensureAgent(name);

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
// DASHBOARD BUILDER
// =========================

function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
}

function dashboard() {
    let out = [];

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

        out.push(`${name} — ${status}`);
    }

    return `📞 Live Agent Dashboard\n\n${out.join("\n") || "No agents"}`;
}

// =========================
// DISCORD READY
// =========================

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    await registerCommands();

    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    let msg = await channel.send(dashboard());

    setInterval(() => {
        msg.edit(dashboard()).catch(() => {});
    }, 2000);
});

// =========================
// START SERVER
// =========================

client.login(process.env.DISCORD_TOKEN);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
