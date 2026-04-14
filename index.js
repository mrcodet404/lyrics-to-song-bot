const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = '!';

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
            }
        });
        const $ = cheerio.load(response.data);
        
        // Cari element dengan class yang mengandung tanggal
        const dateText = $('p.text-gray-400.mt-1.text-sm.whitespace-nowrap').text().trim();
        
        if (dateText) {
            // Extract tanggal (format: 2026-04-14 09:45:40)
            const dateMatch = dateText.match(/(\d{4}-\d{2}-\d{2})/);
            return dateMatch ? dateMatch[1] : null;
        }
        
        return null;
    } catch (error) {
        console.error('Error scraping date:', error.message);
        return null;
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

// Fungsi utama untuk process link
async function processLyricsLink(url) {
    // Extract ID dari URL
    const id = extractId(url);
    if (!id) {
        throw new Error('Invalid URL format');
    }

    // Get tanggal dari halaman
    const date = await getDateFromPage(url);
    if (!date) {
        throw new Error('Could not extract date from page');
    }

    // Construct MP3 URL
    const mp3Url = `https://cdn.lyricsintosong.com/${date}/${id}.mp3`;
    
    // Verify MP3 exists
    const exists = await verifyMP3Exists(mp3Url);
    
    return { mp3Url, id, date, exists };
}

client.on('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`🚀 Ready to get MP3 links from lyricsintosong.com`);
});

client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check if message contains lyricsintosong.com link
    const lyricsRegex = /https:\/\/lyricsintosong\.com\/play\/[a-f0-9-]+/;
    const match = message.content.match(lyricsRegex);

    if (match) {
        const url = match[0];
        const processingMsg = await message.reply('🔄 Getting MP3 link...');

        try {
            // Process link
            const { mp3Url, id, date, exists } = await processLyricsLink(url);
            
            // Create embed message
            const embed = new EmbedBuilder()
                .setColor(exists ? '#00ff00' : '#ffaa00')
                .setTitle('🎵 MP3 Link Ready!')
                .addFields(
                    { name: '📅 Date', value: date, inline: true },
                    { name: '🆔 ID', value: id, inline: true },
                    { name: '✅ Status', value: exists ? 'Verified' : 'Not Verified', inline: true },
                    { name: '🔗 Download Link', value: `[Click here to download](${mp3Url})` }
                )
                .setFooter({ text: 'Click the link above to download the MP3 file' })
                .setTimestamp();

            await processingMsg.edit({
                content: `**MP3 Link:**\n${mp3Url}`,
                embeds: [embed]
            });

        } catch (error) {
            console.error('Error:', error);
            await processingMsg.edit(`❌ Error: ${error.message}`);
        }
    }

    // Command help
    if (message.content === `${PREFIX}help`) {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 Lyrics to Song Bot - Help')
            .setDescription('Get MP3 download links from lyricsintosong.com')
            .addFields(
                {
                    name: '📖 How to use',
                    value: 'Just paste a link from lyricsintosong.com and I\'ll give you the MP3 download link!'
                },
                {
                    name: '💡 Example',
                    value: '```https://lyricsintosong.com/play/fd222b54-f99b-4c57-b5fe-e48540ffc2b7```'
                },
                {
                    name: '🛠️ Commands',
                    value: `\`${PREFIX}help\` - Show this message\n\`${PREFIX}ping\` - Check bot status`
                }
            )
            .setFooter({ text: 'Made with ❤️' })
            .setTimestamp();

        message.reply({ embeds: [helpEmbed] });
    }

    // Command ping
    if (message.content === `${PREFIX}ping`) {
        const sent = await message.reply('🏓 Pinging...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        
        const pingEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('🏓 Pong!')
            .addFields(
                { name: '⚡ Bot Latency', value: `${latency}ms`, inline: true },
                { name: '📡 API Latency', value: `${Math.round(client.ws.ping)}ms`, inline: true }
            )
            .setTimestamp();

        sent.edit({ content: null, embeds: [pingEmbed] });
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

if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN not found in environment variables!');
    process.exit(1);
}

client.login(TOKEN);
