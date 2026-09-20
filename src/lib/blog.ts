import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { siteConfig } from "@/config/site";
import { BLOG_CATEGORIES, getPostTags, getTopicGroup, validCoverPath, type BlogCategory } from "./blog-content";

const BLOG_DIR = path.join(process.cwd(), "content/blog");

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  updated?: string;
  readingTime: number;
  category: BlogCategory;
  tags: string[];
  author: string;
  coverImage: string;
  coverAlt: string;
}

export interface Post extends PostMeta {
  content: string;
}

export const POSTS_PER_PAGE = 10;
// Repository articles cannot change inside an immutable production image. Cache
// their metadata per process; development still reads edits on every request.
let productionMetadata: PostMeta[] | undefined;
const copyMetadata = (posts: PostMeta[]) => posts.map((post) => ({ ...post, tags: [...post.tags] }));

function readPost(slug: string, raw: string): Post {
  const { data, content } = matter(raw);
  const category = typeof data.category === "string" && Object.hasOwn(BLOG_CATEGORIES, data.category)
    ? data.category as BlogCategory : getTopicGroup(slug);
  const hasCover = validCoverPath(data.coverImage) && fs.existsSync(path.join(process.cwd(), "public", data.coverImage));
  return {
    slug, title: String(data.title ?? slug), description: String(data.description ?? ""), date: String(data.date ?? ""),
    ...(typeof data.updated === "string" && Number.isFinite(new Date(data.updated).getTime()) ? { updated: data.updated } : {}),
    readingTime: Math.max(1, Math.round(content.trim().split(/\s+/).length / 200)),
    category, tags: getPostTags(slug, data.tags),
    // Preserve explicit attribution; unsigned legacy articles use the editorial publisher.
    author: typeof data.author === "string" && data.author.trim() ? data.author.trim().slice(0, 100) : siteConfig.name,
    coverImage: hasCover ? data.coverImage as string : "/images/journal-cover.png",
    coverAlt: hasCover && typeof data.coverAlt === "string" ? data.coverAlt.slice(0, 200) : "TheFastestWeb performance journal",
    content,
  };
}

export function getAllPosts(): PostMeta[] {
  if (process.env.NODE_ENV === "production" && productionMetadata) return copyMetadata(productionMetadata);
  if (!fs.existsSync(BLOG_DIR)) return [];
  const posts = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((filename) => {
      const slug = filename.replace(".mdx", "");
      const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf-8");
      const { content: _content, ...meta } = readPost(slug, raw);
      void _content;
      return meta;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  if (process.env.NODE_ENV === "production") productionMetadata = posts;
  return copyMetadata(posts);
}

export function getPaginatedPosts(page: number, filters: { category?: string; tag?: string } = {}): {
  posts: PostMeta[];
  totalPages: number;
  currentPage: number;
  total: number;
} {
  const all = getAllPosts().filter((post) => (!filters.category || post.category === filters.category)
    && (!filters.tag || post.tags.includes(filters.tag)));
  const totalPages = Math.max(1, Math.ceil(all.length / POSTS_PER_PAGE));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * POSTS_PER_PAGE;
  return {
    posts: all.slice(start, start + POSTS_PER_PAGE),
    totalPages,
    currentPage,
    total: all.length,
  };
}

export function getRelatedPosts(currentSlug: string, count = 3): PostMeta[] {
  const all = getAllPosts();
  const group = getTopicGroup(currentSlug);
  const sameGroup = all.filter(
    (p) => p.slug !== currentSlug && getTopicGroup(p.slug) === group
  );
  const others = all.filter(
    (p) => p.slug !== currentSlug && getTopicGroup(p.slug) !== group
  );
  return [...sameGroup, ...others].slice(0, count);
}

export function getPost(slug: string): Post | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  return readPost(slug, raw);
}
