const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
    ]
});

// Fungsi untuk extract ID dari URL
function extractId(url) {
    const match = url.match(/https:\/\/lyricsintosong\.com\/play\/([a-f0-9-]+)/);
    return match ? match[1] : null;
}

// Fungsi untuk scrape tanggal dari halaman
async function getDateFromPage(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });
        const $ = cheerio.load(response.data);
        
        const dateText = $('p.text-gray-400.mt-1.text-sm.whitespace-nowrap').text().trim();
        
        if (dateText) {
            const dateMatch = dateText.match(/(\d{4}-\d{2}-\d{2})/);
            return dateMatch ? dateMatch[1] : null;
        }
        
        return null;
    } catch (error) {
        console.error('Error scraping date:', error.message);
        throw new Error('Failed to fetch page data. Please check if the URL is valid.');
    }
}

// Fungsi untuk verify apakah MP3 ada
async function verifyMP3Exists(mp3Url) {
    try {
        const response = await axios.head(mp3Url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

// Fungsi untuk get file size
async function getFileSize(mp3Url) {
    try {
        const response = await axios.head(mp3Url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const bytes = response.headers['content-length'];
        if (bytes) {
            const mb = (bytes / (1024 * 1024)).toFixed(2);
            return `${mb} MB`;
        }
        return 'Unknown';
    } catch (error) {
        return 'Unknown';
    }
}

// Fungsi utama untuk process link
async function processLyricsLink(url) {
    const id = extractId(url);
    if (!id) {
        throw new Error('Invalid URL format. Please use: https://lyricsintosong.com/play/[id]');
    }

    const date = await getDateFromPage(url);
    if (!date) {
        throw new Error('Could not extract date from page. The page might be invalid or unavailable.');
    }

    const mp3Url = `https://cdn.lyricsintosong.com/${date}/${id}.mp3`;
    const exists = await verifyMP3Exists(mp3Url);
    
    let fileSize = 'Unknown';
    if (exists) {
        fileSize = await getFileSize(mp3Url);
    }
    
    return { mp3Url, id, date, exists, fileSize };
}

// Register slash commands
async function registerCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName('lsong')
            .setDescription('Get MP3 download link from lyricsintosong.com')
            .addStringOption(option =>
                option
                    .setName('url')
                    .setDescription('The lyricsintosong.com URL')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('help')
            .setDescription('Show help information'),
        new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Check bot latency')
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('🔄 Started refreshing application (/) commands.');

        // Register commands globally
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );

        console.log('✅ Successfully reloaded application (/) commands globally!');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

client.on('ready', async () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`🤖 Bot ID: ${client.user.id}`);
    console.log(`📊 Servers: ${client.guilds.cache.size}`);
    console.log(`🚀 Ready to get MP3 links from lyricsintosong.com`);
    
    // Register commands
    await registerCommands();
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // Command: /lsong
    if (commandName === 'lsong') {
        await interaction.deferReply();

        const url = interaction.options.getString('url');

        const urlRegex = /^https:\/\/lyricsintosong\.com\/play\/[a-f0-9-]+$/;
        if (!urlRegex.test(url)) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Invalid URL')
                .setDescription('Please provide a valid lyricsintosong.com URL')
                .addFields({
                    name: '💡 Example',
                    value: '```https://lyricsintosong.com/play/fd222b54-f99b-4c57-b5fe-e48540ffc2b7```'
                })
                .setTimestamp();

            return interaction.editReply({ embeds: [errorEmbed] });
        }

        try {
            const { mp3Url, id, date, exists, fileSize } = await processLyricsLink(url);
            
            const embed = new EmbedBuilder()
                .setColor(exists ? '#00ff00' : '#ffaa00')
                .setTitle('🎵 MP3 Link Generated!')
                .setDescription(`**Direct Download Link:**\n${mp3Url}`)
                .addFields(
                    { name: '📅 Date', value: `\`${date}\``, inline: true },
                    { name: '📦 File Size', value: `\`${fileSize}\``, inline: true },
                    { name: '✅ Status', value: exists ? '`✓ Verified`' : '`⚠ Not Verified`', inline: true },
                    { name: '🆔 Song ID', value: `\`${id}\`` },
                    { name: '🔗 Download', value: `[Click here to download MP3](${mp3Url})` }
                )
                .setFooter({ text: 'Click the link above to download • Made with ❤️' })
                .setTimestamp();

            if (!exists) {
                embed.addFields({
                    name: '⚠️ Warning',
                    value: 'File verification failed. The link might still work, but please check manually.'
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error')
                .setDescription(error.message)
                .addFields({
                    name: '💡 Tips',
                    value: '• Make sure the URL is correct\n• Check if the page exists\n• Try again in a few moments'
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    // Command: /help
    if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 Lyrics to Song Bot - Help')
            .setDescription('Get MP3 download links from lyricsintosong.com easily!')
            .addFields(
                {
                    name: '📖 How to use',
                    value: 'Use the `/lsong` command with a lyricsintosong.com URL to get the MP3 download link.'
                },
                {
                    name: '💡 Example',
                    value: '```/lsong url:https://lyricsintosong.com/play/fd222b54-f99b-4c57-b5fe-e48540ffc2b7```'
                },
                {
                    name: '🛠️ Available Commands',
                    value: '`/lsong` - Get MP3 download link\n`/help` - Show this help message\n`/ping` - Check bot status'
                },
                {
                    name: '✨ Features',
                    value: '• Fast link generation\n• File verification\n• File size information\n• Beautiful embed display'
                }
            )
            .setFooter({ text: 'Made with ❤️' })
            .setTimestamp();

        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }

    // Command: /ping
    if (commandName === 'ping') {
        const sent = await interaction.deferReply({ fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        
        const pingEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🏓 Pong!')
            .addFields(
                { name: '⚡ Bot Latency', value: `\`${latency}ms\``, inline: true },
                { name: '📡 API Latency', value: `\`${Math.round(client.ws.ping)}ms\``, inline: true },
                { name: '🟢 Status', value: '`Online`', inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [pingEmbed] });
    }
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN not found in environment variables!');
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error('❌ CLIENT_ID not found in environment variables!');
    process.exit(1);
}

client.login(TOKEN).catch(error => {
    console.error('❌ Failed to login:', error);
    process.exit(1);
});
