import { MockFeed } from "@/components/feed/mock-feed";

export default function Home() {
  return (
    <main className="h-full">
      <h1 className="sr-only">Rabbithole</h1>
      <MockFeed />
    </main>
  );
}
