/**
 * Generates tweet content from GitHub release notes using GitHub Models AI.
 *
 * Input (env vars):
 *   RELEASE_NOTES  — aggregated markdown release notes
 *   GITHUB_TOKEN   — token for GitHub Models inference API
 *   MODEL          — (optional) model name, defaults to "gpt-4o-mini"
 *
 * Output (stdout):
 *   JSON object: { "tweets": ["tweet1", "tweet2", ...] }
 *   Single-element array for a regular post, multi-element for a thread.
 */

const GITHUB_MODELS_URL =
  "https://models.inference.ai.azure.com/chat/completions";

const MAX_TWEET_LENGTH = 280;
const MAX_THREAD_LENGTH = 4;

const SYSTEM_PROMPT = `You are a developer-friendly social media manager for Evolution SDK, an open-source Cardano TypeScript SDK built with Effect-TS.

Your job: read release notes and write a post for X (Twitter).

Rules:
- Tone: casual but informative, like a dev announcing to peers. No corporate speak.
- Each tweet must be ≤${MAX_TWEET_LENGTH} characters (this is a HARD limit — count carefully).
- For small patch releases (bug fixes only): write 1 tweet.
- For releases with new features, significant fixes, or breaking changes: write a thread of 2-${MAX_THREAD_LENGTH} tweets.
- First tweet should summarize what shipped and grab attention.
- Thread tweets expand on the most interesting changes — focus on what developers care about.
- The LAST tweet MUST end with the release URL (provided separately, do NOT invent URLs).
- NEVER use emojis. Zero emojis in any tweet.
- NEVER use hashtags. Zero hashtags in any tweet.
- Never fabricate features or changes not in the release notes.
- If the release is only dependency bumps with no real changes, respond with an empty tweets array.
- Do not include a numbering prefix like "1/" or "2/" in thread tweets.

Respond with ONLY a JSON object, no markdown fences:
{ "tweets": ["first tweet text", "second tweet text (if thread)", ...] }`;

const generateTweets = async (releaseNotes, releaseUrl, token, model) => {
  const userPrompt = `Here are the release notes:\n\n${releaseNotes}\n\nRelease URL: ${releaseUrl}`;

  const response = await fetch(GITHUB_MODELS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub Models API error ${response.status}: ${text.slice(0, 500)}`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in AI response");
  }

  const parsed = JSON.parse(content);

  if (!Array.isArray(parsed.tweets)) {
    throw new Error(`Expected { tweets: string[] }, got: ${content}`);
  }

  // Validate tweet lengths
  for (const [i, tweet] of parsed.tweets.entries()) {
    if (tweet.length > MAX_TWEET_LENGTH) {
      console.warn(
        `Warning: Tweet ${i + 1} is ${tweet.length} chars (max ${MAX_TWEET_LENGTH}). Truncating.`
      );
      parsed.tweets[i] = tweet.slice(0, MAX_TWEET_LENGTH - 1) + "…";
    }
  }

  // Cap thread length
  if (parsed.tweets.length > MAX_THREAD_LENGTH) {
    parsed.tweets = parsed.tweets.slice(0, MAX_THREAD_LENGTH);
  }

  // Ensure the last tweet contains the release URL
  if (releaseUrl && parsed.tweets.length > 0) {
    const last = parsed.tweets[parsed.tweets.length - 1];
    if (!last.includes(releaseUrl)) {
      const appended = `${last}\n\n${releaseUrl}`;
      if (appended.length <= MAX_TWEET_LENGTH) {
        parsed.tweets[parsed.tweets.length - 1] = appended;
      } else {
        // Trim last tweet to make room for URL
        const maxText = MAX_TWEET_LENGTH - releaseUrl.length - 3; // 3 for \n\n + …
        parsed.tweets[parsed.tweets.length - 1] =
          last.slice(0, maxText) + "…\n\n" + releaseUrl;
      }
    }
  }

  return parsed;
};

// --- Main ---

const releaseNotes =
  process.env.RELEASE_NOTES ||
  (process.env.RELEASE_NOTES_FILE
    ? (await import("fs")).default.readFileSync(
        process.env.RELEASE_NOTES_FILE,
        "utf-8"
      )
    : undefined);
const releaseUrl = process.env.RELEASE_URL || "";
const token = process.env.GITHUB_TOKEN;
const model = process.env.MODEL;

if (!releaseNotes) {
  console.error("RELEASE_NOTES env var is required");
  process.exit(1);
}

if (!token) {
  console.error("GITHUB_TOKEN env var is required");
  process.exit(1);
}

try {
  const result = await generateTweets(releaseNotes, releaseUrl, token, model);
  console.log(JSON.stringify(result));
} catch (error) {
  console.error("Failed to generate tweets:", error.message);
  process.exit(1);
}
