import { Client, EmbedBuilder, GatewayIntentBits } from "discord.js";
import cron from "node-cron";
import dotenv from "dotenv";
import { readFile, writeFile } from "fs";
import RSSParser from "rss-parser";
import * as cheerio from "cheerio";

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once("ready", () => {
    console.log(`Logged in as ${client.user?.tag}!`);
});

client.login(process.env.TOKEN);

let newHighestDate: Date | undefined;

async function runTask() {
    let highestDate: Date | undefined;

    const parser = new RSSParser();

    try {
        const subredditUrl: string | undefined = process.env.REDDITURL;

        if (!subredditUrl) {
            console.error("No subreddit url set.");
            return;
        }

        const feed = await parser.parseURL(`${subredditUrl}/new.rss`);

        readFile(
            "./date.txt",
            "utf8",
            (err: NodeJS.ErrnoException | null, data: string) => {
                if (err) {
                    console.error("Error reading the file:", err);
                    return;
                }
                highestDate = new Date(data);
                console.log("File content:", highestDate);
            }
        );

        if (!highestDate) return;

        for (const item of feed.items) {
            if (!item.pubDate) {
                continue;
            }

            const publishedDate = new Date(item.pubDate);

            if (highestDate >= publishedDate) continue;

            console.log("sending");

            await sendMessage(item);

            if (!newHighestDate || newHighestDate <= publishedDate) {
                newHighestDate = publishedDate;
            }
        }

        console.log("highest " + newHighestDate);

        if (!newHighestDate) return;

        writeFile(
            "./date.txt",
            newHighestDate.toISOString(),
            "utf8",
            (err: NodeJS.ErrnoException | null) => {
                if (err) {
                    console.error("Error writing to the file:", err);
                    return;
                }
                console.log("File content written successfully");
            }
        );
        console.log("date " + newHighestDate);
    } catch (error) {
        console.error("Error running cron task: ", error);
        throw error;
    }
}

async function sendMessage(item: { [key: string]: any } & RSSParser.Item) {
    try {
        if (!process.env.CHANNEL) {
            console.error("No channel id set.");
            return;
        }

        if (!process.env.REDDITURL) {
            console.error("No subreddit url set.");
            return;
        }

        const channel = await client.channels.fetch(process.env.CHANNEL);

        if (!channel) {
            console.error("Error fetching this channel.");
            return;
        }

        if (!channel.isTextBased()) {
            console.error("The specified channel is not a text-based channel.");
            return;
        }

        const title: string = item.title ?? "Title Error";
        const link: string = item.link ?? "Link Error";
        const author: string = item.author ?? "Author error";

        if (!item.content) {
            return;
        }

        const $ = cheerio.load(item.content);
        const imageSrc = $("img").attr("src");
        const text = $(".md").text().trim();

        const embed = new EmbedBuilder()
            .setColor(0xff4500)
            .setAuthor({
                name: author,
                url: `https://www.reddit.com${author}`,
            })
            .setTitle(title)
            .setURL(link)
            .setTimestamp();

        if (text) {
            embed.setDescription(text);
        }

        if (imageSrc) {
            embed.setImage(imageSrc);
        }

        await channel.send({
            embeds: [embed],
            allowedMentions: { users: [] },
        });
    } catch (error) {
        console.error("Error sending message: ", error);
    }
}

runTask();

cron.schedule("*/5 * * * *", runTask);
