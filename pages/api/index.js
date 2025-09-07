import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Brahms Club - Complete Chamber Works</h1>
      <p>Welcome to the Brahms Club concert booking page.</p>
      <Link href="/booking">
        <button>Book Tickets</button>
      </Link>
    </main>
  );
}