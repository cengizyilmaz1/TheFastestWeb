import { siteConfig } from "@/config/site";

/** Public editorial copy shared by the HTML and Markdown representations. */
export const aboutPage = {
  title: "About TheFastestWeb",
  description: "Learn how TheFastestWeb records website performance, what its PageSpeed scores mean, and how Cengiz YILMAZ operates the service.",
  path: "/about",
  sections: [
    {
      id: "purpose", title: "Less guesswork. More useful measurements.",
      paragraphs: [
        "TheFastestWeb helps website owners measure performance, follow changes over time, and discover fast websites. Run a speed test, read the results, or submit your own website to the public leaderboard.",
        "The goal is practical: make web performance easier to understand and give developers a useful record of how their sites change.",
      ],
    },
    {
      id: "measurements", title: "Know what you are comparing.",
      paragraphs: ["A score is a starting point. The conditions behind it matter just as much."],
      bullets: [
        "Tests use Google PageSpeed Insights and Lighthouse lab measurements. Mobile and desktop use different conditions and should be compared separately. A single run cannot describe every visitor's experience.",
        "Public reports bring together measured timings, test dates, and available history. Repeated measurements can help you spot a regression after a deployment or check whether an optimization made a difference.",
        "Lab scores and real-user Core Web Vitals describe different aspects of performance. Check the device, measurement date, and individual metrics before comparing results.",
      ],
    },
    {
      id: "rankings", title: "Performance earns its place.",
      paragraphs: ["The leaderboard orders websites by measured performance. Pro expands listing features, while advertising provides a separate sponsor placement. Paying does not improve a measured score or organic rank."],
    },
    {
      id: "privacy", title: "You choose what is public.",
      paragraphs: ["You choose whether to publish a listing. Private account details are not used as a public founder profile without an explicit opt-in."],
    },
    {
      id: "operator", title: "Independently owned and maintained",
      get paragraphs() { return [`TheFastestWeb is owned and maintained by ${siteConfig.ownerName}.`, "Building a practical resource for people who care about the websites they put into the world.", `Contact: ${siteConfig.email}.`, `Website: ${siteConfig.ownerUrl}.`]; },
    },
  ],
} as const;
