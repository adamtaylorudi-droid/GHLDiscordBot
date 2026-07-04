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
// SLASH COMMANDS (SINGLE COPY)
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
    await rest.put(
        Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            process.env.GUILD_ID
        ),
        { body: commands }
    );
    console.log("Slash commands registered");
}

// =========================
// HELPERS
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

function normalize(body) {
    return body?.body || body || {};
}

function parseGHL(body) {
    const payload = normalize(body);

    return {
        event: payload?.event || "unknown",
        agent:
            payload?.agent_name ||
            payload?.agent?.name ||
            payload?.user?.name ||
            "Unknown Agent"
    };
}

// =========================
// WEBHOOK
// =========================

app.post("/ghl-webhook", (req, res) => {
    try {
        const { event, agent } = parseGHL(req.body);

        console.log("EVENT:", event, "AGENT:", agent);

        if (event === "call_started") {
            const a = getAgent(agent);
            a.call = true;
            a.callStartTime = Date.now();
        }

        if (event === "call_ended") {
            const a = getAgent(agent);
            a.call = false;
            a.callStartTime = null;
        }

        res.sendStatus(200);
    } catch (e) {
        console.log(e);
        res.sendStatus(200);
    }
});

// =========================
// DISCORD COMMANDS
// =========================

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
        const member = interaction.member;

        if (!member.roles.cache.some(r => r.name === "Agents")) {
            return interaction.reply({ content: "Agents only", flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        const name = member.displayName;
        const agent = getAgent(name);

        if (interaction.commandName === "online") {
            agent.presence = "online";
            return interaction.editReply("🟢 Online");
        }

        if (interaction.commandName === "offline") {
            agent.presence = "offline";
            return interaction.editReply("⚫ Offline");
        }

    } catch (e) {
        console.log(e);
    }
});

// =========================
// READY
// =========================

client.once("clientReady", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    await registerCommands();

    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    let msg = await channel.send("Dashboard starting...");

    setInterval(() => {
        let output = Object.entries(agents)
            .map(([name, a]) => {
                if (a.call) return `${name} 🔴 On Call`;
                if (a.presence === "online") return `${name} 🟢 Online`;
                return `${name} ⚫ Offline`;
            })
            .join("\n");

        msg.edit(output || "No agents").catch(() => {});
    }, 3000);
});

// =========================
// START
// =========================

client.login(process.env.DISCORD_TOKEN);
app.listen(PORT, () => console.log("Running on", PORT));
