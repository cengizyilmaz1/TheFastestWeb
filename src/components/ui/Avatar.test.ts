import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Avatar } from "./Avatar";
import { LeaderboardRow } from "@/components/leaderboard/LeaderboardRow";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

describe("published founder avatars", () => {
  it("renders the published image in initial HTML without waiting for hydration", () => {
    const html = renderToStaticMarkup(React.createElement(LeaderboardRow, { rank: 1, site: {
      id: "site", slug: "example", name: "Example", url: "https://example.com", description: "Example site",
      category: null, faviconUrl: null, currentScore: 99, ownerId: "owner", ownerName: "Public Founder",
      ownerAvatarUrl: "https://media.example.com/published.webp", ownerUsername: "public-founder", twitterHandle: null,
    } }));
    expect(html).toContain('src="https://media.example.com/published.webp"');
    expect(html).toContain('width="24" height="24"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).not.toContain("/api/avatar/");
  });
  it("prefers the stored public photo to the optional X provider", () => {
    const html = renderToStaticMarkup(React.createElement(Avatar, {
      name: "Public Founder", src: "https://example.com/published.webp", fallbackSrc: "/api/avatar/example",
    }));
    expect(html).toContain('src="https://example.com/published.webp"');
    expect(html).not.toContain("/api/avatar/");
  });
  it("renders bounded initials or a neutral icon when there is no published photo", () => {
    const named = renderToStaticMarkup(React.createElement(Avatar, { name: "  Public   Founder Long Name " }));
    expect(named).toContain(">PF</span>");
    expect(named).not.toContain("<img");
    const hidden = renderToStaticMarkup(React.createElement(Avatar, { name: "" }));
    expect(hidden).toContain("<svg");
    expect(hidden).not.toContain("<img");
  });
});
