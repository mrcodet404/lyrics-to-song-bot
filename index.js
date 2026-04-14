const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

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
        const response = await axios.get(url);
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

// Fungsi untuk download MP3
async function downloadMP3(mp3Url, outputPath) {
    try {
        const response = await axios({
            method: 'GET',
            url: mp3Url,
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (error) {
        throw new Error(`Error downloading MP3: ${error.message}`);
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
    
    return { mp3Url, id, date };
}

client.on('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`🚀 Ready to download MP3 from lyricsintosong.com`);
});

client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check if message contains lyricsintosong.com link
    const lyricsRegex = /https:\/\/lyricsintosong\.com\/play\/[a-f0-9-]+/;
    const match = message.content.match(lyricsRegex);

    if (match) {
        const url = match[0];
        const processingMsg = await message.reply('🔄 Processing your link...');

        try {
            // Process link
            const { mp3Url, id, date } = await processLyricsLink(url);
            
            await processingMsg.edit(`✅ Found MP3!\n📅 Date: ${date}\n⬇️ Downloading...`);

            // Download MP3
            const fileName = `${id}.mp3`;
            const filePath = path.join(__dirname, fileName);

            await downloadMP3(mp3Url, filePath);

            // Check file size
            const stats = fs.statSync(filePath);
            const fileSizeMB = stats.size / (1024 * 1024);

            // Discord limit is 25MB for non-nitro
            if (fileSizeMB > 25) {
                await processingMsg.edit(`❌ File too large (${fileSizeMB.toFixed(2)}MB). Discord limit is 25MB.\n🔗 Direct link: ${mp3Url}`);
                fs.unlinkSync(filePath);
                return;
            }

            // Send MP3 file
            const attachment = new AttachmentBuilder(filePath);
            await message.reply({
                content: `🎵 Here's your MP3!\n📅 Date: ${date}\n🔗 Direct link: ${mp3Url}`,
                files: [attachment]
            });

            // Delete processing message and local file
            await processingMsg.delete();
            fs.unlinkSync(filePath);

        } catch (error) {
            console.error('Error:', error);
            await processingMsg.edit(`❌ Error: ${error.message}`);
        }
    }

    // Command help
    if (message.content === `${PREFIX}help`) {
        message.reply({
            content: `
**🎵 Lyrics to Song Bot**

**How to use:**
Just paste a link from lyricsintosong.com and I'll download the MP3 for you!

**Example:**
\`https://lyricsintosong.com/play/fd222b54-f99b-4c57-b5fe-e48540ffc2b7\`

**Commands:**
\`${PREFIX}help\` - Show this message
\`${PREFIX}ping\` - Check bot status
            `.trim()
        });
    }

    // Command ping
    if (message.content === `${PREFIX}ping`) {
        const sent = await message.reply('🏓 Pinging...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        sent.edit(`🏓 Pong! Latency: ${latency}ms | API Latency: ${Math.round(client.ws.ping)}ms`);
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
