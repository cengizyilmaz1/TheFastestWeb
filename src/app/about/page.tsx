import type { Metadata } from "next";
import { EditorialPage, type EditorialSection } from "@/components/layout/EditorialPage";
export const metadata: Metadata = { title: "About TheFastestWeb", description: "A performance directory and community for people who care about making the web faster.", alternates: { canonical: "/about" } };

const sections: EditorialSection[] = [
  { id: "discoverable", title: "Good work should be discoverable.", body: <p>From a small independent tool to a growing product, a website can be useful, considered and quick. We bring those websites together in a directory where you can explore their work and inspect their measured performance.</p> },
  { id: "evidence", title: "Evidence before claims.", body: <><p>Every published measurement comes from a recorded test. Website reports show the device, method and measurement time. Weekly competitions compare eligible results under one standard, and completed results stay in the archive.</p><p>Speed scores are not the whole story. They are a starting point for understanding how a website behaves and what could improve.</p></> },
  { id: "people", title: "Built around the people behind the websites.", body: <p>Founders choose whether to publish a profile and which websites to connect to it. An account does not automatically become a public biography. Verified domain claims help people manage the websites they control.</p> },
  { id: "history", title: "A new chapter, with history intact.", body: <p>The platform is being rebuilt with a modern interface, clearer measurement standards and more useful ways to discover websites. Existing website history is preserved and kept distinct from new competition results.</p> },
];

export default function Page() {
  return <EditorialPage eyebrow="Why we are here" title="Make the web a little faster." intro="TheFastestWeb is a place to discover thoughtful websites and the people who build them. Performance is the thread that connects them." sections={sections} contents={false}
    next={[
      { href: "/methodology", label: "Read how we measure", note: "The method, the ranking order and the calendar behind every result." },
      { href: "/explore", label: "Explore the directory", note: "Websites and their recorded performance, in one place." },
      { href: "/submit", label: "Share your website", note: "Add a website you have built to the directory." },
    ]} />;
}
