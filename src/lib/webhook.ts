import { DISCORD_WEBHOOK } from "@/config";
import { pluginSchema } from "@/schema/plugin";
import type { z } from "zod";
import { logger } from "./logger";
import { getPlugin } from "./registry-api";

interface WHBody {
  content: string;
  embeds: {
    title: string;
    description: string;
    color: number;
    url?: string;
    footer?: {
      text: string;
      icon_url: string;
    };
    author?: {
      name: string;
      icon_url: string;
    };
    components?: any;
  }[];
}

async function sendWebhook(body: WHBody) {
  const res = await fetch(DISCORD_WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    logger.error("Failed to send webhook", await res.text());
    return false;
  }

  return res;
}

export async function sendPluginWebhook(
  plugin: z.infer<typeof pluginSchema>,
  status: "update" | "create"
) {
  const body: WHBody = {
    content: "",
    embeds: [
      {
        title: plugin.name,
        description: `${
          plugin.tags.length > 0
            ? plugin.tags.map((e) => `\`${e}\``).join(" ") + "\n"
            : ""
        }${plugin.description ?? ""}`,
        color: status === "create" ? 0x00ff00 : 0xffa500,
        url: `https://blitz-bots.com/plugins/${plugin.name}`,
        author: plugin.author
          ? {
              icon_url: plugin.author.avatar_url ?? "",
              name: plugin.author.username,
            }
          : undefined,
        footer: {
          text: `${plugin.versions[0]} | ${
            status === "create" ? "Created" : "Updated"
          } plugin.`,
          icon_url: "https://assets.blitz-bots.com/blitz.svg",
        },
      },
    ],
  };
  await sendWebhook(body);
}

export async function idToWebhook(pluginName: string, status: "update" | "create") {
  try {
    const plugin = await getPlugin(pluginName, {
      showAllVersions: false,
      provideFullAuthor: true,
    });

    if (!plugin) {
      logger.error(`Plugin ${pluginName} not found`);
      return;
    }

    await sendPluginWebhook(plugin, status);
  } catch (e) {
    logger.error(`Error sending webhook for ${pluginName}`, e);
  }
}
