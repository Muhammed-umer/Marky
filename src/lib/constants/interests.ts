import { Interest } from "@/types/database";

export const DEFAULT_INTERESTS: Omit<Interest, "created_at">[] = [
  {
    id: "int-tech",
    name: "Technology",
    slug: "technology",
    description: "Software, computing, hardware, and web evolution.",
  },
  {
    id: "int-ai",
    name: "Artificial Intelligence",
    slug: "artificial-intelligence",
    description: "Machine learning, neural networks, LLMs, and AI research.",
  },
  {
    id: "int-design",
    name: "Design & UX",
    slug: "design-ux",
    description: "Visual design, typography, UI systems, and product aesthetics.",
  },
  {
    id: "int-science",
    name: "Science & Space",
    slug: "science-space",
    description: "Physics, astronomy, biology, and scientific breakthroughs.",
  },
  {
    id: "int-business",
    name: "Business & Startups",
    slug: "business-startups",
    description: "Entrepreneurship, strategy, economics, and product building.",
  },
  {
    id: "int-culture",
    name: "Culture & Essays",
    slug: "culture-essays",
    description: "Literary essays, longform writing, media, and social critique.",
  },
  {
    id: "int-philosophy",
    name: "Philosophy & Mind",
    slug: "philosophy-mind",
    description: "Ethics, epistemology, cognitive science, and ideas.",
  },
  {
    id: "int-engineering",
    name: "Software Engineering",
    slug: "software-engineering",
    description: "Architecture, system design, web performance, and developer tools.",
  },
];
