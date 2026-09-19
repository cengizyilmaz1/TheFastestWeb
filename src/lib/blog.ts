import fs from "fs";
import path from "path";
import matter from "gray-matter";

const BLOG_DIR = path.join(process.cwd(), "content/blog");

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  readingTime: number;
}

export interface Post extends PostMeta {
  content: string;
}

export const POSTS_PER_PAGE = 10;

function getTopicGroup(slug: string): string {
  if (slug.startsWith("what-is-") && !slug.includes("pagespeed-insights") && !slug.includes("good-pagespeed")) {
    return "metrics";
  }
  if (slug.includes("-vs-")) return "comparisons";
  if (
    slug.endsWith("-pagespeed-optimization-guide") ||
    slug.endsWith("-performance-optimization-guide")
  ) {
    return "frameworks";
  }
  return "guides";
}

export function getAllPosts(): PostMeta[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((filename) => {
      const slug = filename.replace(".mdx", "");
      const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf-8");
      const { data } = matter(raw);
      const wordCount = raw.split(/\s+/).length;
      return {
        slug,
        title: data.title,
        description: data.description,
        date: data.date,
        readingTime: Math.max(1, Math.round(wordCount / 200)),
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPaginatedPosts(page: number): {
  posts: PostMeta[];
  totalPages: number;
  currentPage: number;
} {
  const all = getAllPosts();
  const totalPages = Math.ceil(all.length / POSTS_PER_PAGE);
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * POSTS_PER_PAGE;
  return {
    posts: all.slice(start, start + POSTS_PER_PAGE),
    totalPages,
    currentPage,
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
  const { data, content } = matter(raw);
  const wordCount = raw.split(/\s+/).length;
  return {
    slug,
    title: data.title,
    description: data.description,
    date: data.date,
    readingTime: Math.max(1, Math.round(wordCount / 200)),
    content,
  };
}
